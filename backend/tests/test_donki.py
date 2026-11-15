import datetime as dt

import httpx
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.donki import HOSTS, AdvisoryCache, build_advisory, mars_arrivals

CME = {
    "activityID": "2026-11-09T18:15:00-CME-001",
    "startTime": "2026-11-09T18:15Z",
    "sourceLocation": "S14W65",
    "link": "https://example.org/cme",
    "cmeAnalyses": [
        {
            "speed": 726.0,
            "enlilList": [
                {
                    "link": "run1",
                    "impactList": [
                        {
                            "location": "Mars",
                            "arrivalTime": "2026-11-13T12:00Z",
                            "isGlancingBlow": True,
                        },
                        {
                            "location": "STEREO A",
                            "arrivalTime": "2026-11-12T00:00Z",
                            "isGlancingBlow": False,
                        },
                    ],
                },
                {
                    "link": "run2",
                    "impactList": [
                        {
                            "location": "Mars",
                            "arrivalTime": "2026-11-13T12:00Z",
                            "isGlancingBlow": True,
                        },
                    ],
                },
            ],
        }
    ],
}


def fake_fetch(data, fail_hosts=()):
    calls = []

    def fetch(host, kind, start, end):
        calls.append((host, kind, start, end))
        if host in fail_hosts:
            raise httpx.ConnectError("down")
        return data.get(kind, [])

    fetch.calls = calls
    return fetch


def test_mars_arrivals_keep_mars_only_and_drop_repeated_runs():
    hits = mars_arrivals([CME])
    assert len(hits) == 1
    assert hits[0]["arrival_utc"] == "2026-11-13T12:00Z" and hits[0]["glancing_blow"] is True
    assert hits[0]["speed_km_s"] == 726.0
    assert mars_arrivals([]) == [] and mars_arrivals([{"cmeAnalyses": None}]) == []


def test_advisory_window_fields_and_labels():
    fetch = fake_fetch({"FLR": [{"flrID": "F1", "classType": "M1.2", "extra": 1}], "CME": [CME]})
    a = build_advisory(fetch, dt.date(2026, 11, 15))
    assert a["status"] == "live" and a["window"] == ["2026-11-08", "2026-11-15"]
    assert a["events"]["FLR"]["items"][0]["classType"] == "M1.2"
    assert "extra" not in a["events"]["FLR"]["items"][0]
    assert a["events"]["SEP"]["count"] == 0
    assert "Not a radiation dose at Mars" in a["label"]
    assert "Model, not a measurement" in a["mars_cme_arrivals"]["label"]
    assert len(a["mars_cme_arrivals"]["items"]) == 1


def test_falls_back_to_second_host_and_reports_missing_kinds():
    fetch = fake_fetch({"CME": [CME]}, fail_hosts=(HOSTS[0],))
    a = build_advisory(fetch, dt.date(2026, 11, 15))
    assert a["status"] == "live" and a["errors"]["FLR"][0].startswith(HOSTS[0])
    down = build_advisory(fake_fetch({}, fail_hosts=HOSTS), dt.date(2026, 11, 15))
    assert down["status"] == "incomplete" and down["missing"] == ["FLR", "SEP", "CME"]
    assert down["mars_cme_arrivals"] is None


def test_cache_reuses_a_live_answer_for_an_hour():
    now = [0.0]
    fetch = fake_fetch({"CME": [CME]})
    cache = AdvisoryCache(fetch, clock=lambda: now[0])
    cache.get()
    cache.get()
    assert len(fetch.calls) == 3
    now[0] = 3601
    cache.get()
    assert len(fetch.calls) == 6


def test_route_sets_cdn_cache_header():
    cache = AdvisoryCache(fake_fetch({"CME": [CME]}))
    with TestClient(create_app(donki_cache=cache)) as client:
        r = client.get("/api/v1/donki")
    assert r.status_code == 200
    assert "s-maxage=3600" in r.headers["cache-control"]
    assert r.json()["mars_cme_arrivals"]["items"][0]["cme_id"] == CME["activityID"]
