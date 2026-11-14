import json
import math
from bisect import bisect_right
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
        "navigation",
        "supports_alternatives",
    }
    assert data["distance_m"] > 52
    assert data["max_slope_deg"] == 0
    assert data["est_time_s"] == pytest.approx(data["distance_m"] / (2 / 3.6))
    assert data["safety"] == "ok" and data["safety_reason"]
    assert data["alternative"] is None
    assert [h["id"] for h in data["hazards"]] == ["hazard-1"]  # the hill, see test_hazard_zones_*
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


def test_profile_preserves_slope_peaks_on_each_leg(terrain):
    path, meta, slope = terrain
    slope[:] = 40
    slope[2, :] = 0  # A single walkable corridor, with peaks between 20m samples.
    slope[2, 3] = 24
    slope[2, 16] = 22
    slope.tofile(path / "slope.bin")
    payload = {
        "start": point(meta, 2, 0, "start"),
        "stops": [point(meta, 2, 11, "one"), point(meta, 2, 30, "two")],
        "constraints": {"max_slope_deg": 15},
    }
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    boundary = data["stops"][0]["dist_m"]
    profile = data["profile"]
    assert any(p["dist_m"] == boundary for p in profile)
    assert max(p["slope_deg"] for p in profile if p["dist_m"] <= boundary) == 12
    assert max(p["slope_deg"] for p in profile if p["dist_m"] >= boundary) == 11
    assert max(p["slope_deg"] for p in profile) == data["max_slope_deg"]


@pytest.mark.parametrize("cell_m", [0.5, 1.0, 2.0, 10.0])
def test_navigation_ignores_connectors_at_all_five_stops(terrain, cell_m):
    path, meta, slope = terrain
    meta["cell_m"] = cell_m
    (path / "meta.json").write_text(json.dumps(meta))
    slope[:] = 0
    slope.tofile(path / "slope.bin")
    cells = [(15, 2), (12, 2), (12, 6), (12, 2), (8, 2), (4, 6)]
    points = []
    for i, (row, col) in enumerate(cells):
        p = point(meta, row, col, "start" if i == 0 else f"stop-{i}")
        # Off-centre clicks: these create connectors before AND after each stop.
        p["lon"] += math.degrees(
            0.2 * cell_m / (meta["mars_radius_m"] * math.cos(math.radians(meta["center"]["lat"])))
        )
        p["lat"] -= math.degrees(0.2 * cell_m / meta["mars_radius_m"])
        points.append(p)
    payload = {"start": points[0], "stops": points[1:], "constraints": {"max_slope_deg": 15}}
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["supports_alternatives"] is False
    nav = data["navigation"]
    distances = nav["vertex_dist_m"]
    refs = nav["heading_segments"]
    assert len(distances) == len(data["polyline"])
    assert len(refs) == len(distances) - 1
    assert distances[0] == 0 and distances[-1] == data["distance_m"]
    assert all(a < b for a, b in zip(distances[:-1], distances[1:], strict=True))
    assert all(0 <= ref < len(refs) and refs[ref] == ref for ref in refs)

    def heading_at(distance):
        segment = min(bisect_right(distances, distance) - 1, len(refs) - 1)
        ref = refs[segment]
        a, b = data["polyline"][ref : ref + 2]
        east = (b[0] - a[0]) * math.cos(math.radians(meta["center"]["lat"]))
        north = b[1] - a[1]
        return math.degrees(math.atan2(east, north)) % 360

    boundaries = [0, *[s["dist_m"] for s in data["stops"]]]
    for i, expected in enumerate([0, 90, 270, 0, 45]):
        # Start/departure, actual grid travel, and arrival connector of EVERY leg.
        for distance in [
            boundaries[i],
            (boundaries[i] + boundaries[i + 1]) / 2,
            boundaries[i + 1] - cell_m * 0.01,
        ]:
            assert heading_at(distance) == pytest.approx(expected, abs=1e-4)
    assert heading_at(data["distance_m"]) == pytest.approx(45, abs=1e-4)


@pytest.mark.parametrize("same_position", [False, True])
def test_navigation_for_same_cell_and_coincident_stops(terrain, same_position):
    path, meta, _ = terrain
    start = point(meta, 2, 2, "start")
    stop = {**start, "id": "one"}
    if not same_position:
        stop["lat"] += math.degrees(0.2 * meta["cell_m"] / meta["mars_radius_m"])
    payload = {
        "start": start,
        "stops": [stop, {**stop, "id": "two"}],
        "constraints": {"max_slope_deg": 15},
    }
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["navigation"] == {
        "vertex_dist_m": [0, data["distance_m"]],
        "heading_segments": [0],
    }
    assert data["stops"][0]["dist_m"] == data["stops"][1]["dist_m"]


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
        response = client.get("/api/v1/layers").json()
        layers = response["layers"]
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


def inside(polygon, lon, lat):
    """Even-odd point-in-polygon over the outer ring and any holes (GeoJSON rings)."""
    hits = 0
    for ring in polygon["coordinates"]:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:], strict=False):
            if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                hits += 1
    return hits % 2 == 1


def test_hazard_zone_covers_the_steep_hill_only(terrain):
    path, meta, _ = terrain
    with TestClient(create_app(path)) as client:
        data = client.post("/api/v1/route", json=request(meta)).json()
    (zone,) = data["hazards"]
    assert zone["kind"] == "steep_slope" and zone["label"] == "Slope over 15 deg"
    ring = zone["polygon"]["coordinates"][0]
    assert ring[0] == ring[-1] and len(ring) == 5  # a rectangle: four corners and the closing point
    cell_m = meta["cell_m"]
    lat_scale = meta["mars_radius_m"] * math.pi / 180
    lon_scale = lat_scale * math.cos(math.radians(meta["center"]["lat"]))
    width = (max(x for x, _ in ring) - min(x for x, _ in ring)) * lon_scale
    height = (max(y for _, y in ring) - min(y for _, y in ring)) * lat_scale
    assert width == pytest.approx(7 * cell_m, rel=1e-3)  # columns 12..18
    assert height == pytest.approx(11 * cell_m, rel=1e-3)  # rows 10..20
    assert not any(inside(zone["polygon"], lon, lat) for lon, lat in data["polyline"])


def test_hazard_zones_drop_regions_under_ten_cells(terrain):
    path, meta, slope = terrain
    slope[8:10, 2:4] = 40  # four cells: too small to be a zone
    slope[22:25, 2:5] = 40  # nine cells: still too small
    slope.tofile(path / "slope.bin")
    with TestClient(create_app(path)) as client:
        data = client.post("/api/v1/route", json=request(meta)).json()
    assert [h["id"] for h in data["hazards"]] == ["hazard-1"]  # only the big hill


def test_hazard_zones_keep_at_most_eight_nearest_the_route(terrain):
    path, meta, slope = terrain
    for k in range(10):  # ten 12-cell hills along the top and bottom edges, away from the route row
        row = 0 if k % 2 == 0 else 27
        col = 1 + (k // 2) * 6
        slope[row : row + 4, col : col + 3] = 40
    slope.tofile(path / "slope.bin")
    with TestClient(create_app(path)) as client:
        data = client.post("/api/v1/route", json=request(meta)).json()
    zones = data["hazards"]
    assert len(zones) == 8
    assert [h["id"] for h in zones] == [f"hazard-{n}" for n in range(1, 9)]
    # The big hill by the route is the nearest region, so it comes first and is wider than a 3x4 hill.
    first = zones[0]["polygon"]["coordinates"][0]
    assert max(x for x, _ in first) - min(x for x, _ in first) > 0.00015


def test_hazard_zones_on_the_shipped_real_grid():
    path = Path(__file__).parents[1] / "data/gale-bx"
    meta = json.loads((path / "meta.json").read_text())
    box = meta["bbox"]
    with TestClient(create_app(path)) as client:
        site = client.get("/api/v1/sites").json()["sites"][0]
        targets = {s["id"]: s for s in site["stops"]}
        ids = site["groups"][0]["stop_ids"]
        payload = {
            "start": {k: targets[ids[0]][k] for k in ("id", "lon", "lat", "name")},
            "stops": [{k: targets[i][k] for k in ("id", "lon", "lat", "name")} for i in ids[1:]],
            "constraints": {"max_slope_deg": 15},
        }
        response = client.post("/api/v1/route", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    hazards = data["hazards"]
    assert 1 <= len(hazards) <= 8
    assert len({h["id"] for h in hazards}) == len(hazards)
    for zone in hazards:
        assert zone["label"] == "Slope over 15 deg" and zone["kind"] == "steep_slope"
        for ring in zone["polygon"]["coordinates"]:
            assert len(ring) >= 4 and ring[0] == ring[-1]
            for lon, lat in ring:
                assert box["lon_min"] <= lon <= box["lon_max"]
                assert box["lat_min"] <= lat <= box["lat_max"]
        for lon, lat in data["polyline"]:
            assert not inside(zone["polygon"], lon, lat), zone["id"]
    assert len(response.content) < 150_000  # simplified outlines keep the response small
