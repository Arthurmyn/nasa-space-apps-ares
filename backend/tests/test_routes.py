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
        # added with route profiles, all additive
        "route_profile",
        "profile_fallback",
        "stats",
        "return",
        "round_trip_time_s",
        "eva_limit_s",
        "return_check",
        "stops_time_s",
        "eva_time_s",
        "status",
        "reasons",
        "readiness",
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
        assert set(site) == {"id", "name", "groups", "stops", "context"}
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
    # The big hill by the route is the nearest region: it comes first and is wider than a 3x4 hill.
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


def thermal_info(meta):
    return {
        "schema": "ares.thermal/v1",
        "layer": "thermal",
        "site_id": meta["site_id"],
        "bbox": meta["bbox"],
        "source": {
            "title": "Test THEMIS",
            "credit": "NASA/ASU/USGS",
            "page_url": "https://example.org/t",
        },
    }


def layers_of(path):
    with TestClient(create_app(path)) as client:
        return {x["id"]: x for x in client.get("/api/v1/layers").json()["layers"]}


def with_bbox(path, meta):
    meta = {**meta, "bbox": {"lon_min": 1.0, "lon_max": 2.0, "lat_min": -2.0, "lat_max": -1.0}}
    (path / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    return meta


def test_thermal_is_unavailable_without_its_file_and_radiation_is_not_a_map(terrain):
    path, _, _ = terrain
    layers = layers_of(path)
    assert layers["thermal"]["available"] is False
    assert layers["thermal"]["reason"] == "No data for this site"
    assert layers["geology"]["reason"] == "No data for this site"
    assert layers["radiation"]["available"] is False
    assert layers["radiation"]["reason"] == "Single value for the whole site, see route summary"


def test_thermal_becomes_available_with_a_matching_file(terrain):
    path, meta, _ = terrain
    meta = with_bbox(path, meta)
    (path / "thermal.json").write_text(json.dumps(thermal_info(meta)), encoding="utf-8")
    thermal = layers_of(path)["thermal"]
    assert thermal["available"] is True and thermal["reason"] is None
    assert "Test THEMIS" in thermal["source"] and "NASA/ASU/USGS" in thermal["source"]


@pytest.mark.parametrize(
    "change",
    [
        {"bbox": {"lon_min": 0, "lon_max": 1, "lat_min": 0, "lat_max": 1}},
        {"site_id": "other"},
        {"schema": "x"},
    ],
)
def test_thermal_file_for_another_place_is_ignored(terrain, change):
    path, meta, _ = terrain
    meta = with_bbox(path, meta)
    (path / "thermal.json").write_text(
        json.dumps({**thermal_info(meta), **change}), encoding="utf-8"
    )
    assert layers_of(path)["thermal"]["available"] is False


def test_shipped_thermal_layer_matches_the_site_grid():
    root = Path(__file__).parents[1]
    meta = json.loads((root / "data/gale-bx/meta.json").read_text())
    info = json.loads((root / "data/gale-bx/thermal.json").read_text())
    public = root.parent / "frontend/public/data/gale-bx"
    assert (public / "thermal.json").read_text() == (root / "data/gale-bx/thermal.json").read_text()
    assert info["bbox"] == meta["bbox"] and info["site_id"] == meta["site_id"]
    png = public / "thermal.png"
    assert png.stat().st_size < 20_000
    from PIL import Image

    assert Image.open(png).size == (meta["width"], meta["height"])
    assert info["native_pixel_m"] == 100.0
    assert info["value"]["site_dn_min"] < info["value"]["site_dn_max"]
    assert layers_of(root / "data/gale-bx")["thermal"]["available"] is True


def test_shipped_site_has_no_context_and_plain_stops():
    path = Path(__file__).parents[1] / "data/gale-bx"
    with TestClient(create_app(path)) as client:
        site = client.get("/api/v1/sites").json()["sites"][0]
    assert site["context"] is None  # the "Why this site" text was removed
    # Stops stay plain waypoints: no science claim is attached to any of them.
    assert all(stop["note"].startswith("Curiosity waypoint at sol ") for stop in site["stops"])


def test_site_without_context_has_none(terrain):
    path, _, _ = terrain
    with TestClient(create_app(path)) as client:
        assert client.get("/api/v1/sites").json()["sites"][0]["context"] is None


def test_shipped_stop_images_are_local_credited_and_small():
    root = Path(__file__).parents[2]
    with TestClient(create_app(root / "backend/data/gale-bx")) as client:
        stops = client.get("/api/v1/sites").json()["sites"][0]["stops"]
    assert len(stops) == 6
    for stop in stops:
        sol = stop["note"].split("sol ")[1].split(",")[0]
        image = stop["image"]
        assert stop["name"] == f"Boxwork traverse point, sol {sol}"
        assert image["url"].startswith("/app/stops/")  # served by the frontend, never hotlinked
        assert image["credit"].startswith("NASA/JPL-Caltech, Mars Science Laboratory, sol " + sol)
        assert image["alt"].strip()
        path = root / "frontend/public" / image["url"].removeprefix("/app/")
        assert path.is_file() and path.stat().st_size <= 150_000
        from PIL import Image

        assert Image.open(path).size[0] == 800


DATA_ROOT = Path(__file__).parents[1] / "data"


def two_passable_points(grid, count=2):
    """Cells of one connected passable region (slope below 10 degrees) of a real grid, far apart."""
    mask = (grid.valid & (grid.slope <= 10)).ravel().tolist()
    width, height = grid.width, grid.height
    seen = bytearray(width * height)
    best: list[int] = []
    for seed in range(width * height):
        if not mask[seed] or seen[seed]:
            continue
        seen[seed] = 1
        stack, members = [seed], []
        while stack:
            index = stack.pop()
            members.append(index)
            row, col = divmod(index, width)
            for nr, nc in ((row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)):
                nxt = nr * width + nc
                if 0 <= nr < height and 0 <= nc < width and mask[nxt] and not seen[nxt]:
                    seen[nxt] = 1
                    stack.append(nxt)
        if len(members) > len(best):
            best = sorted(members)
    chosen = [best[int(q * (len(best) - 1))] for q in np.linspace(0.2, 0.8, count)]
    points = []
    for n, index in enumerate(chosen):
        x, y = grid.center_xy(index)
        lon, lat = grid.lonlat(x, y)
        points.append({"id": "start" if n == 0 else f"stop-{n}", "lon": lon, "lat": lat})
    return points


def test_all_site_folders_are_loaded_and_the_default_comes_first():
    with TestClient(create_app(DATA_ROOT)) as client:
        sites = client.get("/api/v1/sites").json()["sites"]
        ids = [s["id"] for s in sites]
        assert ids[0] == "gale-bx" and "gale-001488" in ids and len(ids) == len(set(ids))
        assert set(client.app.state.grids) == set(ids)
        assert client.app.state.grid is client.app.state.grids["gale-bx"]


def test_layers_use_the_default_site_unless_site_id_is_given():
    with TestClient(create_app(DATA_ROOT)) as client:
        default = {x["id"]: x for x in client.get("/api/v1/layers").json()["layers"]}
        explicit = {
            x["id"]: x for x in client.get("/api/v1/layers?site_id=gale-bx").json()["layers"]
        }
        other = {
            x["id"]: x for x in client.get("/api/v1/layers?site_id=gale-001488").json()["layers"]
        }
    assert default == explicit
    assert other["slope"]["available"] and "DTEEC_001488" in other["slope"]["source"]
    assert "DTEEC_009149" in default["slope"]["source"]


def test_unknown_site_is_a_404_for_layers_and_route():
    with TestClient(create_app(DATA_ROOT)) as client:
        assert client.get("/api/v1/layers?site_id=nope").status_code == 404
        body = {
            "site_id": "nope",
            "start": {"id": "start", "lon": 137.3, "lat": -4.9},
            "stops": [{"id": "stop-1", "lon": 137.3, "lat": -4.9}],
            "constraints": {"max_slope_deg": 15},
        }
        response = client.post("/api/v1/route", json=body)
        assert response.status_code == 404 and "nope" in response.json()["detail"]


@pytest.mark.parametrize("site_id", ["gale-bx", "gale-001488"])
def test_route_is_planned_on_the_requested_site(site_id):
    with TestClient(create_app(DATA_ROOT)) as client:
        grid = client.app.state.grids[site_id]
        start, stop = two_passable_points(grid)
        body = {
            "site_id": site_id,
            "start": start,
            "stops": [stop],
            "constraints": {"max_slope_deg": 15},
        }
        response = client.post("/api/v1/route", json=body)
        assert response.status_code == 200, response.text
        box = grid.meta["bbox"]
        for lon, lat in response.json()["polyline"]:
            assert (
                box["lon_min"] <= lon <= box["lon_max"] and box["lat_min"] <= lat <= box["lat_max"]
            )


def test_points_of_one_site_are_outside_the_grid_of_another():
    with TestClient(create_app(DATA_ROOT)) as client:
        start, stop = two_passable_points(client.app.state.grids["gale-001488"])
        body = {
            "start": start,
            "stops": [stop],
            "constraints": {"max_slope_deg": 15},
        }  # no site_id: gale-bx
        response = client.post("/api/v1/route", json=body)
        assert (
            response.status_code == 422 and "outside the terrain grid" in response.json()["detail"]
        )


def test_site_folder_with_a_wrong_site_id_is_skipped(tmp_path):
    import shutil

    shutil.copytree(DATA_ROOT / "gale-bx", tmp_path / "gale-bx")
    shutil.copytree(DATA_ROOT / "gale-001488", tmp_path / "renamed")  # meta.json says gale-001488
    with TestClient(create_app(tmp_path)) as client:
        assert [s["id"] for s in client.get("/api/v1/sites").json()["sites"]] == ["gale-bx"]


def test_a_broken_site_is_left_out_and_never_replaced_by_another(tmp_path):
    import shutil

    shutil.copytree(DATA_ROOT / "gale-bx", tmp_path / "gale-bx")
    shutil.copytree(DATA_ROOT / "gale-001488", tmp_path / "gale-001488")
    (tmp_path / "gale-001488" / "slope.bin").write_bytes(b"short")
    with TestClient(create_app(tmp_path)) as client:
        assert [s["id"] for s in client.get("/api/v1/sites").json()["sites"]] == ["gale-bx"]
        assert client.get("/api/v1/layers?site_id=gale-001488").status_code == 404


def test_shipped_second_site_grid_is_consistent_and_small():
    root = DATA_ROOT / "gale-001488"
    meta = json.loads((root / "meta.json").read_text())
    assert meta["site_id"] == "gale-001488" and meta["is_test_data"] is False
    assert meta["dtm_product_id"] == "DTEEC_001488_1750_001752_1750_U02"
    public = root.parents[2] / "frontend/public/data/gale-001488"
    assert (public / "meta.json").read_text() == (root / "meta.json").read_text()
    total = sum(p.stat().st_size for d in (root, public) for p in d.rglob("*") if p.is_file())
    assert total <= 3_000_000


@pytest.mark.parametrize("site_id", ["gale-bx", "gale-001488"])
def test_frontend_elevation_copy_equals_the_backend_file(site_id):
    backend = DATA_ROOT / site_id / "elevation.bin"
    frontend = DATA_ROOT.parents[1] / "frontend/public/data" / site_id / "elevation.bin"
    assert backend.read_bytes() == frontend.read_bytes()


# ---- route profiles, stats, return trip, status and sensitivity -------------------------------


def band_terrain(path, slope, deg, cols=(10, 21), rows=(5, 26)):
    """A band of `deg` slope across the test grid; rows outside `rows` stay flat (a corridor)."""
    slope[:] = 0
    slope[rows[0] : rows[1], cols[0] : cols[1]] = int(deg * 2)  # slope.bin is in 0.5 degree units
    slope.tofile(path / "slope.bin")


def set_assumptions(path, **changes):
    file = path / "assumptions.json"
    data = json.loads(file.read_text())
    data.update(changes)
    file.write_text(json.dumps(data), encoding="utf-8")


def plan(client, meta, **extra):
    body = {**request(meta), **extra}
    body.pop("compare", None)
    return client.post("/api/v1/route", json=body)


def test_default_profile_is_balanced_and_the_new_fields_are_present(terrain):
    path, meta, _ = terrain
    with TestClient(create_app(path)) as client:
        default = plan(client, meta).json()
        balanced = plan(client, meta, profile="balanced").json()
    assert default["route_profile"] == "balanced" and default["profile_fallback"] is False
    assert default["distance_m"] == pytest.approx(balanced["distance_m"])
    assert default["polyline"] == balanced["polyline"]
    for key in ("stats", "return", "round_trip_time_s", "status", "reasons"):
        assert key in default
    assert default["return"].keys() == {"distance_m", "est_time_s"}


def test_unknown_profile_is_rejected(terrain):
    path, meta, _ = terrain
    with TestClient(create_app(path)) as client:
        assert plan(client, meta, profile="reckless").status_code == 422


def test_return_trip_and_round_trip_time(terrain):
    path, meta, _ = terrain
    with TestClient(create_app(path)) as client:
        data = plan(client, meta).json()
    # Flat terrain: the way back along the same stops is as long as the way out.
    assert data["return"]["distance_m"] == pytest.approx(data["distance_m"], rel=1e-6)
    assert data["round_trip_time_s"] == pytest.approx(
        data["est_time_s"] + data["return"]["est_time_s"]
    )
    assert data["return"]["est_time_s"] == pytest.approx(data["return"]["distance_m"] / (2 / 3.6))


def test_stats_add_up_and_follow_the_terrain(terrain):
    path, meta, slope = terrain
    slope[:] = 0
    slope[:, 14:17] = 24  # 12 degrees: above the 10 degree caution threshold, below the limit
    slope.tofile(path / "slope.bin")
    with TestClient(create_app(path)) as client:
        data = plan(client, meta).json()
    pct = data["stats"]["slope_class_pct"]
    assert pct["ok"] + pct["caution"] + pct["avoid"] == pytest.approx(100.0)
    assert pct["caution"] > 0 and pct["avoid"] == 0 and pct["ok"] > 50
    assert (
        data["stats"]["climb_m"] == 0 and data["stats"]["descent_m"] == 0
    )  # the test grid is flat


def test_climb_and_descent_are_summed_from_the_elevation_samples(terrain):
    path, meta, _ = terrain
    rise = np.linspace(0, 10, 31, dtype="<f4")  # 10 m up from west to east
    np.tile(rise, (31, 1)).astype("<f4").tofile(path / "elevation.bin")
    with TestClient(create_app(path)) as client:
        forward = plan(client, meta).json()
        backward_body = {
            **request(meta),
            "start": request(meta)["stops"][0],
            "stops": [request(meta)["start"]],
        }
        backward = client.post("/api/v1/route", json=backward_body).json()
    assert forward["stats"]["climb_m"] == pytest.approx(10 * 26 / 30, abs=1.0)
    assert forward["stats"]["descent_m"] == pytest.approx(0, abs=1e-6)
    assert backward["stats"]["descent_m"] == pytest.approx(forward["stats"]["climb_m"], abs=1e-6)


def test_fast_profile_takes_the_steeper_shorter_way(terrain):
    path, meta, slope = terrain
    band_terrain(path, slope, 15, cols=(8, 23))  # steep but passable, 15 cells wide
    with TestClient(create_app(path)) as client:
        balanced = plan(client, meta, profile="balanced").json()
        fast = plan(client, meta, profile="fast").json()
    assert fast["route_profile"] == "fast"
    assert fast["distance_m"] < balanced["distance_m"]  # balanced walks round the band
    assert fast["max_slope_deg"] > balanced["max_slope_deg"]


def test_safe_profile_stays_under_the_caution_threshold_when_it_can(terrain):
    path, meta, slope = terrain
    band_terrain(path, slope, 12)  # with a flat corridor round the band
    with TestClient(create_app(path)) as client:
        safe = plan(client, meta, profile="safe").json()
    assert safe["max_slope_deg"] <= 10 and safe["profile_fallback"] is False
    assert safe["status"] == "GO"


def test_safe_profile_falls_back_to_the_normal_limit_and_says_so(terrain):
    path, meta, slope = terrain
    band_terrain(path, slope, 12, rows=(0, 31))  # a band across the whole grid: no way round
    with TestClient(create_app(path)) as client:
        safe = plan(client, meta, profile="safe")
        balanced = plan(client, meta, profile="balanced").json()
    assert safe.status_code == 200, safe.text
    data = safe.json()
    assert data["profile_fallback"] is True and data["route_profile"] == "safe"
    assert data["max_slope_deg"] > 10 and data["distance_m"] == pytest.approx(
        balanced["distance_m"]
    )
    assert data["status"] == "CAUTION"
    assert any("safe profile" in r for r in data["reasons"])
    assert any(
        a["name"] == "Route profile" and "fell back" in a["value"] for a in data["assumptions"]
    )


def test_status_is_go_within_limits_and_caution_above_the_threshold(terrain):
    path, meta, slope = terrain
    with TestClient(create_app(path)) as client:
        go = plan(client, meta).json()
    assert go["status"] == "GO" and go["reasons"]
    band_terrain(path, slope, 12, rows=(0, 31))
    with TestClient(create_app(path)) as client:
        caution = plan(client, meta).json()
    assert caution["status"] == "CAUTION"
    assert any("caution threshold" in r for r in caution["reasons"])


def test_status_is_no_go_when_the_round_trip_exceeds_the_eva_limit(terrain):
    path, meta, _ = terrain
    set_assumptions(path, eva_limit_s=60)
    with TestClient(create_app(path)) as client:
        data = plan(client, meta).json()
    assert data["eva_limit_s"] == 60 and data["round_trip_time_s"] > 60
    assert data["status"] == "NO-GO"
    assert any("EVA time limit" in r for r in data["reasons"])


def test_a_missing_eva_limit_skips_that_rule(terrain):
    path, meta, _ = terrain
    with TestClient(create_app(path)) as client:
        data = plan(client, meta).json()
    assert data["eva_limit_s"] is None and data["status"] == "GO"


def test_an_invalid_eva_limit_makes_the_data_unusable(terrain):
    path, meta, _ = terrain
    set_assumptions(path, eva_limit_s=-5)
    with TestClient(create_app(path)) as client:
        assert plan(client, meta).status_code == 503


def test_no_path_is_a_422_that_says_no_go(terrain):
    path, meta, slope = terrain
    slope[:] = 0
    slope[:, 14:17] = 255  # no-data wall
    slope.tofile(path / "slope.bin")
    with TestClient(create_app(path)) as client:
        response = plan(client, meta)
    assert response.status_code == 422
    body = response.json()
    assert (
        body["status"] == "NO-GO"
        and body["reasons"] == [body["detail"]]
        and "No route" in body["detail"]
    )


def test_readiness_is_nominal_when_status_is_go(terrain):
    path, meta, _ = terrain
    with TestClient(create_app(path)) as client:
        data = plan(client, meta).json()
    assert data["status"] == "GO"
    assert data["readiness"] == {"level": "NOMINAL", "reasons": data["reasons"]}


def test_readiness_is_marginal_above_the_caution_slope(terrain):
    path, meta, slope = terrain
    band_terrain(path, slope, 12, rows=(0, 31))
    with TestClient(create_app(path)) as client:
        data = plan(client, meta).json()
    assert data["status"] == "CAUTION"
    assert data["readiness"]["level"] == "MARGINAL"
    assert any("caution threshold" in r for r in data["readiness"]["reasons"])


def test_readiness_is_marginal_when_the_safe_profile_fell_back(terrain):
    path, meta, slope = terrain
    band_terrain(path, slope, 12, rows=(0, 31))
    with TestClient(create_app(path)) as client:
        data = plan(client, meta, profile="safe").json()
    assert data["profile_fallback"] is True
    assert data["readiness"]["level"] == "MARGINAL"
    assert any("safe profile" in r for r in data["readiness"]["reasons"])


def test_readiness_is_not_advised_when_the_round_trip_exceeds_the_eva_limit(terrain):
    path, meta, _ = terrain
    set_assumptions(path, eva_limit_s=60)
    with TestClient(create_app(path)) as client:
        data = plan(client, meta).json()
    assert data["status"] == "NO-GO"
    assert data["readiness"]["level"] == "NOT_ADVISED"
    assert any("EVA time limit" in r for r in data["readiness"]["reasons"])


def test_readiness_is_not_advised_in_the_422_when_there_is_no_path(terrain):
    path, meta, slope = terrain
    slope[:] = 0
    slope[:, 14:17] = 255
    slope.tofile(path / "slope.bin")
    with TestClient(create_app(path)) as client:
        body = plan(client, meta).json()
    assert body["status"] == "NO-GO"
    assert body["readiness"] == {"level": "NOT_ADVISED", "reasons": [body["detail"]]}


@pytest.mark.parametrize("site", ["gale-bx", "gale-001488"])
def test_the_real_gale_data_cites_the_eva_and_return_limits(site):
    data = json.loads((DATA_ROOT / site / "assumptions.json").read_text())
    assert data["eva_limit_s"] == 28800
    assert (data["return_limit_m"], data["return_limit_s"]) == (2000, 3600)
    names = {i["name"]: i["source"] for i in data["items"]}
    # Checked against NASA EVA-EXP-0075: "Supports EVAs of up to 8 hours in duration".
    assert "8 hours" in names["EVA time limit"] and "[1]" in names["EVA time limit"]
    assert "2 km" in names["Return limit"] and "[1]" in names["Return limit"]


def test_real_route_answers_with_every_new_field():
    with TestClient(create_app(DATA_ROOT)) as client:
        start, stop = two_passable_points(client.app.state.grids["gale-bx"])
        body = {"start": start, "stops": [stop], "constraints": {"max_slope_deg": 15}}
        data = client.post("/api/v1/route", json=body).json()
    assert data["status"] in {"GO", "CAUTION"} and data["eva_limit_s"] == 28800
    assert data["round_trip_time_s"] > data["est_time_s"] > 0
    assert data["stats"]["climb_m"] >= 0 and data["stats"]["descent_m"] >= 0


def test_sensitivity_reports_each_limit(terrain):
    path, meta, slope = terrain
    band_terrain(path, slope, 12, rows=(0, 31))  # a 12 degree band across the grid
    with TestClient(create_app(path)) as client:
        response = client.post(
            "/api/v1/route/sensitivity", json={**request(meta), "profile": "safe"}
        )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["site_id"] == "gale-bx"
    by_limit = {r["limit_deg"]: r for r in data["results"]}
    assert set(by_limit) == {10.0, 15.0, 20.0}
    blocked = by_limit[10.0]
    assert blocked["reachable"] is False and "10 degrees" in blocked["reason"]
    assert blocked["distance_m"] is None and blocked["est_time_s"] is None
    for limit in (15.0, 20.0):
        ok = by_limit[limit]
        assert ok["reachable"] is True and ok["reason"] is None
        assert ok["distance_m"] > 0 and ok["est_time_s"] > 0 and ok["max_slope_deg"] == 12


def test_sensitivity_tries_20_degrees_even_though_the_site_caps_real_routes_at_15(terrain):
    path, meta, slope = terrain
    band_terrain(path, slope, 18, rows=(0, 31))
    with TestClient(create_app(path)) as client:
        results = client.post("/api/v1/route/sensitivity", json=request(meta)).json()["results"]
        real = plan(client, meta)
    by_limit = {r["limit_deg"]: r for r in results}
    assert by_limit[15.0]["reachable"] is False and by_limit[20.0]["reachable"] is True
    assert real.status_code == 422  # the real route still obeys the 15 degree data limit


def test_sensitivity_rejects_points_outside_the_grid(terrain):
    path, meta, _ = terrain
    body = {**request(meta), "start": {"id": "start", "lon": 10.0, "lat": 10.0}}
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route/sensitivity", json=body)
    assert response.status_code == 422 and response.json()["status"] == "NO-GO"


def test_sensitivity_uses_the_requested_site():
    with TestClient(create_app(DATA_ROOT)) as client:
        start, stop = two_passable_points(client.app.state.grids["gale-001488"])
        body = {
            "site_id": "gale-001488",
            "start": start,
            "stops": [stop],
            "constraints": {"max_slope_deg": 15},
        }
        data = client.post("/api/v1/route/sensitivity", json=body).json()
    assert data["site_id"] == "gale-001488" and len(data["results"]) == 3


def with_return_limits(path, limit_m=2000, limit_s=3600, eva_limit_s=28800):
    file = path / "assumptions.json"
    data = json.loads(file.read_text())
    data.update(return_limit_m=limit_m, return_limit_s=limit_s, eva_limit_s=eva_limit_s)
    file.write_text(json.dumps(data), encoding="utf-8")


def test_return_check_walks_around_terrain_from_every_point(terrain):
    path, meta, _ = terrain
    with_return_limits(path)
    with TestClient(create_app(path)) as client:
        data = client.post("/api/v1/route", json=request(meta)).json()
    check = data["return_check"]
    # The hill blocks the 52 m straight line, so the way back is a real detour.
    assert check["worst_return_m"] > 52
    assert check["worst_return_m"] <= data["distance_m"] + 1e-6
    assert check["worst_return_s"] == pytest.approx(check["worst_return_m"] / (2 / 3.6))
    assert check["ok"] is True and (check["limit_m"], check["limit_s"]) == (2000, 3600)
    assert 0 <= check["worst_route_dist_m"] <= data["distance_m"]
    assert any("within the return limit" in r for r in data["reasons"])
    assert data["stops_time_s"] == 0
    assert data["eva_time_s"] == pytest.approx(data["round_trip_time_s"])


def test_return_check_reports_worst_point_of_a_loop(terrain):
    path, meta, _ = terrain
    with_return_limits(path)
    payload = request(meta)
    # Out to the far side, then back next to the start: the far point is the worst.
    payload["stops"] = [point(meta, 15, 28, "far"), point(meta, 15, 4, "near")]
    with TestClient(create_app(path)) as client:
        data = client.post("/api/v1/route", json=payload).json()
    check = data["return_check"]
    assert check["worst_return_m"] > 52
    assert check["worst_route_dist_m"] == pytest.approx(data["stops"][0]["dist_m"], abs=6)


def test_return_check_over_limit_is_no_go(terrain):
    path, meta, _ = terrain
    with_return_limits(path, limit_m=30)
    with TestClient(create_app(path)) as client:
        data = client.post("/api/v1/route", json=request(meta)).json()
    assert data["return_check"]["ok"] is False
    assert data["status"] == "NO-GO"
    assert any("over the 0.03 km / 60 min return limit" in r for r in data["reasons"])


def test_time_at_stops_counts_toward_the_eva_limit(terrain):
    path, meta, _ = terrain
    with_return_limits(path, eva_limit_s=1800)
    payload = {**request(meta), "stop_time_min": 20}
    payload["stops"] = [point(meta, 15, 28, "a"), point(meta, 15, 4, "b")]
    with TestClient(create_app(path)) as client:
        data = client.post("/api/v1/route", json=payload).json()
    assert data["stops_time_s"] == 2 * 20 * 60
    assert data["eva_time_s"] == pytest.approx(data["round_trip_time_s"] + 2400)
    # The walk alone is minutes; with 40 min at stops it is over the 30 min test limit.
    assert data["round_trip_time_s"] < 1800 and data["status"] == "NO-GO"
    assert any(r.startswith("EVA time (round trip + time at stops)") for r in data["reasons"])
    assert any(a["name"] == "Time at each stop" for a in data["assumptions"])


def test_no_return_limit_means_no_return_check(terrain):
    path, meta, _ = terrain
    with TestClient(create_app(path)) as client:
        data = client.post("/api/v1/route", json=request(meta)).json()
    assert data["return_check"] is None


@pytest.mark.parametrize("minutes, status", [(0, 200), (240, 200), (-1, 422), (241, 422)])
def test_stop_time_validation(terrain, minutes, status):
    path, meta, _ = terrain
    with TestClient(create_app(path)) as client:
        response = client.post("/api/v1/route", json={**request(meta), "stop_time_min": minutes})
    assert response.status_code == status, response.text
