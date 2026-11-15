import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services import conditions


def sole(sol, date, min_temp, max_temp, pressure, min_gts, max_gts):
    return {
        "id": str(sol - 250),
        "terrestrial_date": date,
        "sol": str(sol),
        "ls": "341",
        "season": "Month 12",
        "min_temp": min_temp,
        "max_temp": max_temp,
        "pressure": pressure,
        "pressure_string": "Higher",
        "abs_humidity": "--",
        "wind_speed": "--",
        "wind_direction": "--",
        "atmo_opacity": "Sunny",
        "sunrise": "06:46",
        "sunset": "18:51",
        "local_uv_irradiance_index": "Moderate",
        "min_gts_temp": min_gts,
        "max_gts_temp": max_gts,
    }


FEED = {
    "descriptions": {"disclaimer_en": "outreach only"},
    # The newest sol is not first: the feed order is not guaranteed.
    "soles": [
        sole(4994, "2026-08-24", "-70", "-4", "770", "-83", "3"),
        sole(4995, "2026-08-25", "-71", "-5", "777", "-84", "4"),
    ],
}


@pytest.fixture(autouse=True)
def fresh_cache():
    conditions.clear_cache()
    yield
    conditions.clear_cache()


@pytest.fixture
def client():
    with TestClient(create_app()) as c:
        yield c


def test_normalizes_the_newest_sol(monkeypatch, client):
    monkeypatch.setattr(conditions, "fetch_feed", lambda: FEED)
    data = client.get("/api/v1/conditions").json()
    assert data["available"] is True and data["sol"] == 4995 and data["earth_date"] == "2026-08-25"
    assert (data["air_temp_min_c"], data["air_temp_max_c"]) == (-71, -5)
    assert (data["ground_temp_min_c"], data["ground_temp_max_c"]) == (-84, 4)
    assert data["pressure_pa"] == 777 and data["pressure_note"] == "Higher"
    assert data["ls_deg"] == 341 and data["uv_index"] == "Moderate" and data["opacity"] == "Sunny"
    assert data["wind_speed"] is None  # "--" in the feed means no value
    assert "outreach" in data["disclaimer"] and "Centro de Astrobiologia" in data["provider"]
    assert data["fetched_at"].endswith("Z")


def test_cached_for_an_hour(monkeypatch):
    calls = []
    monkeypatch.setattr(conditions, "fetch_feed", lambda: calls.append(1) or FEED)
    clock = [1000.0]
    first = conditions.get_conditions(now=lambda: clock[0])
    clock[0] += 3599
    assert conditions.get_conditions(now=lambda: clock[0]) is first and len(calls) == 1
    clock[0] += 2
    conditions.get_conditions(now=lambda: clock[0])
    assert len(calls) == 2


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ConnectError("offline"),
        httpx.ReadTimeout("slow"),
        httpx.HTTPStatusError(
            "503", request=httpx.Request("GET", "http://x"), response=httpx.Response(503)
        ),
        ValueError("not json"),
        RuntimeError("anything"),
    ],
)
def test_any_failure_is_available_false_and_never_a_500(monkeypatch, client, failure):
    def boom():
        raise failure

    monkeypatch.setattr(conditions, "fetch_feed", boom)
    response = client.get("/api/v1/conditions")
    assert response.status_code == 200
    body = response.json()
    assert body["available"] is False and body["reason"] and "sol" not in body


@pytest.mark.parametrize(
    "feed", [{}, {"soles": []}, {"soles": [{"sol": "x"}]}, {"soles": "no"}, []]
)
def test_a_feed_of_the_wrong_shape_is_available_false(monkeypatch, client, feed):
    monkeypatch.setattr(conditions, "fetch_feed", lambda: feed)
    assert client.get("/api/v1/conditions").json()["available"] is False


def test_a_failure_is_retried_after_a_minute_not_an_hour(monkeypatch):
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) == 1:
            raise httpx.ConnectError("offline")
        return FEED

    monkeypatch.setattr(conditions, "fetch_feed", flaky)
    clock = [0.0]
    assert conditions.get_conditions(now=lambda: clock[0])["available"] is False
    clock[0] += 30
    assert conditions.get_conditions(now=lambda: clock[0])["available"] is False and len(calls) == 1
    clock[0] += 31
    assert conditions.get_conditions(now=lambda: clock[0])["available"] is True and len(calls) == 2


def test_the_feed_url_is_the_nasa_rems_json():
    assert (
        conditions.FEED_URL
        == "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
    )
