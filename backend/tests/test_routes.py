import json
import math
from pathlib import Path
from time import perf_counter

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def point(meta, row, col, id="stop-1"):
    radius = meta["mars_radius_m"]
    x = meta["x_min_m"] + (col + 0.5) * meta["cell_m"]
    y = meta["y_max_m"] - (row + 0.5) * meta["cell_m"]
    lon_scale = radius * math.cos(math.radians(meta["center"]["lat"]))
    return {
        "id": id,
        "lon": meta["center"]["lon"] + math.degrees(x / lon_scale),
        "lat": meta["center"]["lat"] + math.degrees(y / radius),
    }


@pytest.fixture
def terrain(tmp_path):
    meta = {
        "schema": "ares.grid/v1",
        "site_id": "gale-bx",
        "name": "Test terrain",
        "width": 31,
        "height": 31,
        "cell_m": 2,
        "mars_radius_m": 3396190,
        "center": {"lon": 137.38, "lat": -4.8},
        "x_min_m": -31,
        "y_max_m": 31,
        "slope_unit_deg": 0.5,
        "slope_nodata": 255,
        "is_test_data": True,
        "sources": ["Synthetic test terrain"],
    }
    slope = np.zeros((31, 31), dtype=np.uint8)
    slope[10:21, 12:19] = 40  # Impassable hill across the straight route.
    np.zeros((31, 31), dtype="<f4").tofile(tmp_path / "elevation.bin")
    slope.tofile(tmp_path / "slope.bin")
    catalog = {
        **point(meta, 15, 28),
        "name": "Ridge",
        "note": "Science note",
        "image": {"url": "https://example.org/a.png", "alt": "Ridge", "credit": "NASA"},
        "source_id": "test",
    }
    assumptions = {
        "slope_limit_deg": 15,
        "slope_caution_deg": 10,
        "speed_kmh": 2,
        "items": [{"name": "Speed", "value": "2 km/h", "source": "TO VERIFY"}],
    }
    for name, data in [
        ("meta", meta),
        ("stops", {"groups": [], "stops": [catalog]}),
        ("assumptions", assumptions),
    ]:
        (tmp_path / f"{name}.json").write_text(json.dumps(data), encoding="utf-8")
    return tmp_path, meta, slope


def request(meta):
    return {
        "start": point(meta, 15, 2, "start"),
        "stops": [point(meta, 15, 28)],
        "constraints": {"max_slope_deg": 15},
        "compare": True,
    }


def test_route_avoids_hill_and_matches_contract(terrain):
    path, meta, slope = terrain
    payload = request(meta)
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json=payload)
        grid = client.app.state.grid
    assert response.status_code == 200, response.text
    data = response.json()
    assert set(data) == {
        "computed_at",
        "distance_m",
        "max_slope_deg",
        "est_time_s",
        "safety",
        "safety_reason",
        "polyline",
        "stops",
        "hazards",
        "profile",
        "assumptions",
        "alternative",
    }
    assert data["distance_m"] > 52
    assert data["max_slope_deg"] == 0
    assert data["est_time_s"] == pytest.approx(data["distance_m"] / (2 / 3.6))
    assert data["safety"] == "ok" and data["safety_reason"]
    assert data["alternative"] is None and data["hazards"] == []
    for lon, lat in data["polyline"]:
        from app.schemas.route import PointInput

        index = grid.cell_index(PointInput(id="check", lon=lon, lat=lat))
        assert slope.ravel()[index] <= 30
    stop = data["stops"][0]
    assert stop["id"] == "stop-1" and stop["name"] is None
    assert stop["lon"] == payload["stops"][0]["lon"]
    assert stop["lat"] == payload["stops"][0]["lat"]
    assert stop["note"] == "Science note" and stop["image"]["credit"] == "NASA"
    assert stop["dist_m"] == data["distance_m"]
    assert data["profile"][0]["dist_m"] == 0
    assert data["profile"][-1]["dist_m"] == data["distance_m"]
    assert all(
        a["dist_m"] < b["dist_m"]
        for a, b in zip(data["profile"][:-1], data["profile"][1:], strict=True)
    )
    assert data["assumptions"][0]["source"] == "TO VERIFY"


@pytest.mark.parametrize("barrier", [40, 255])
def test_unreachable_segment_returns_explanation(terrain, barrier):
    path, meta, slope = terrain
    slope[:, 15] = barrier
    slope.tofile(path / "slope.bin")
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json=request(meta))
    assert response.status_code == 422
    assert "start" in response.json()["detail"] and "stop-1" in response.json()["detail"]


@pytest.mark.parametrize("kind", ["outside", "nodata", "elevation_nodata", "steep"])
def test_invalid_point_returns_422(terrain, kind):
    path, meta, slope = terrain
    payload = request(meta)
    if kind == "outside":
        payload["start"]["lon"] = 0
    elif kind == "elevation_nodata":
        z = np.zeros((31, 31), dtype="<f4")
        z[15, 2] = np.nan
        z.tofile(path / "elevation.bin")
    else:
        slope[15, 2] = 255 if kind == "nodata" else 40
        slope.tofile(path / "slope.bin")
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json=payload)
    assert response.status_code == 422 and isinstance(response.json()["detail"], str)


def test_layers_sites_and_cached_data(terrain):
    path, meta, _ = terrain
    with TestClient(create_app(path)) as client:
        (path / "slope.bin").unlink()
        layers = client.get("/api/v1/layers").json()["layers"]
        assert {x["id"] for x in layers if x["available"]} == {"slope", "optical"}
        assert all(x["reason"] for x in layers if not x["available"])
        site = client.get("/api/v1/sites").json()["sites"][0]
        assert set(site) == {"id", "name", "groups", "stops"}
        assert site["id"] == "gale-bx" and site["stops"][0]["note"] == "Science note"
        assert client.post("/api/v1/route", json=request(meta)).status_code == 200


@pytest.mark.parametrize("corrupt", [False, True])
def test_missing_or_corrupt_files_return_503(terrain, corrupt):
    path, meta, _ = terrain
    if corrupt:
        (path / "elevation.bin").write_bytes(b"invalid")
    else:
        (path / "slope.bin").unlink()
    with TestClient(create_app(path)) as client:
        for endpoint in ["layers", "sites"]:
            response = client.get(f"/api/v1/{endpoint}")
            assert response.status_code == 503 and "data" in response.json()["detail"].lower()
        assert client.post("/api/v1/route", json=request(meta)).status_code == 503
        assert client.get("/api/v1/health").json() == {"status": "ok", "data_loaded": False}


def test_ordered_stops_and_same_cell(terrain):
    path, meta, _ = terrain
    payload = request(meta)
    payload["stops"] = [
        point(meta, 3, 3, "one"),
        point(meta, 3, 3, "two"),
        point(meta, 15, 28, "three"),
    ]
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json=payload)
    assert response.status_code == 200, response.text
    stops = response.json()["stops"]
    assert [s["id"] for s in stops] == ["one", "two", "three"]
    assert stops[0]["dist_m"] == stops[1]["dist_m"] < stops[2]["dist_m"]


@pytest.mark.parametrize(
    "raw_slope,limit,status", [(24, 20, 200), (36, 20, 422), (24, 8, 422), (30, 15, 200)]
)
def test_request_limit_cannot_relax_data_limit(terrain, raw_slope, limit, status):
    path, meta, slope = terrain
    slope[:] = raw_slope
    slope.tofile(path / "slope.bin")
    payload = request(meta)
    payload["constraints"]["max_slope_deg"] = limit
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json=payload)
    assert response.status_code == status
    if status == 200:
        assert response.json()["safety"] == "caution"
        assert response.json()["max_slope_deg"] == raw_slope * 0.5


def test_prefers_longer_low_cost_route_over_walkable_steep_ridge(terrain):
    path, meta, slope = terrain
    slope[:] = 0
    slope[15, 3:28] = 28  # 14 degrees: walkable but expensive.
    slope.tofile(path / "slope.bin")
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json=request(meta))
    assert response.status_code == 200
    assert response.json()["max_slope_deg"] == 0
    assert response.json()["distance_m"] > 52


def test_cannot_cut_diagonally_between_blocked_cells(terrain):
    path, meta, slope = terrain
    slope[:] = 40
    slope[0, 0] = slope[1, 1] = 0
    slope.tofile(path / "slope.bin")
    payload = {
        "start": point(meta, 0, 0, "start"),
        "stops": [point(meta, 1, 1)],
        "constraints": {"max_slope_deg": 15},
    }
    with TestClient(create_app(path)) as client:
        assert client.post("/api/v1/route", json=payload).status_code == 422


def test_moved_catalog_stop_does_not_keep_science_note(terrain):
    path, meta, _ = terrain
    payload = request(meta)
    payload["stops"] = [point(meta, 2, 2)]
    payload["stops"][0]["name"] = "Custom name"
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json=payload)
    stop = response.json()["stops"][0]
    assert stop["name"] == "Custom name"
    assert stop["note"] is None and stop["image"] is None


@pytest.mark.parametrize("count", [0, 6])
def test_stop_count_validation(terrain, count):
    path, meta, _ = terrain
    payload = request(meta)
    payload["stops"] *= count
    with TestClient(create_app(path)) as client:
        assert client.post("/api/v1/route", json=payload).status_code == 422


def test_shipped_real_grid_group_route_under_three_seconds():
    path = Path(__file__).parents[1] / "data/gale-bx"
    meta = json.loads((path / "meta.json").read_text())
    assert meta["is_test_data"] is False
    with TestClient(create_app(path)) as client:
        site = client.get("/api/v1/sites").json()["sites"][0]
        catalog = {stop["id"]: stop for stop in site["stops"]}
        targets = [catalog[id] for id in site["groups"][0]["stop_ids"]]
        assert len(targets) == 6
        payload = {
            "start": {key: targets[0][key] for key in ("id", "lon", "lat", "name")},
            "stops": [
                {key: target[key] for key in ("id", "lon", "lat", "name")} for target in targets[1:]
            ],
            "constraints": {"max_slope_deg": 15},
        }
        started = perf_counter()
        response = client.post("/api/v1/route", json=payload)
        elapsed = perf_counter() - started
    assert response.status_code == 200, response.text
    assert elapsed < 3, elapsed
    data = response.json()
    assert [stop["id"] for stop in data["stops"]] == [s["id"] for s in targets[1:]]
    assert data["max_slope_deg"] <= 15
    assert data["distance_m"] > 0
    assert all(stop["note"] == catalog[stop["id"]]["note"] for stop in data["stops"])
    print(f"Real-grid group route ({len(targets)} targets): {elapsed:.3f}s")


@pytest.mark.parametrize("requested,effective", [(5, 5), (15, 15), (30, 15)])
def test_effective_limit_is_explained_without_mutating_cached_assumptions(
    terrain, requested, effective
):
    path, meta, _ = terrain
    payload = request(meta)
    payload["constraints"]["max_slope_deg"] = requested
    with TestClient(create_app(path)) as client:
        original_items = [item.model_dump() for item in client.app.state.grid.items]
        for _ in range(2):
            response = client.post("/api/v1/route", json=payload)
            assert response.status_code == 200, response.text
            data = response.json()
            assert f"{effective:g} degree route limit" in data["safety_reason"]
            assert data["safety"] == "ok"
            assumption = data["assumptions"][-1]
            assert assumption["name"] == "Effective route slope limit"
            assert assumption["value"] == f"{effective:g} deg"
            assert f"requested {requested:g} deg" in assumption["source"]
            assert "site limit 15 deg" in assumption["source"]
            assert data["assumptions"][:-1] == original_items
        assert [item.model_dump() for item in client.app.state.grid.items] == original_items
