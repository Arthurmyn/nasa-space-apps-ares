import io
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.transform import from_origin
from scipy.ndimage import label

from scripts.make_slope_grid import build_grid, compute_slope, encode_files, fake_elevation, generate, read_dtm
from scripts import make_slope_grid as slope_grid


ROOT = Path(__file__).resolve().parents[2]
HANDOFF = ROOT / "docs/research/r0/gale_bx_handoff.json"


def test_stop_sources_follow_data_and_do_not_leak_into_terrain_metadata(tmp_path):
    grid = build_grid(json.loads(HANDOFF.read_text()), 2)
    assert not any("src-msl-traverse" in source for source in grid.meta["sources"])
    assert slope_grid.read_stop_sources(tmp_path) == []
    (tmp_path / "sources.json").write_text(json.dumps({
        "src-old": "Old targets", "src-new": "New targets, verified document",
    }))
    (tmp_path / "stops.json").write_text(json.dumps({
        "groups": [], "stops": [{"source_id": "src-new"}, {"source_id": "src-new"}],
    }))
    assert slope_grid.read_stop_sources(tmp_path) == ["src-new: New targets, verified document"]
    (tmp_path / "stops.json").write_text(json.dumps({"stops": [{"source_id": "src-missing"}]}))
    with pytest.raises(ValueError, match="src-missing"):
        slope_grid.read_stop_sources(tmp_path)


@pytest.mark.parametrize("cell", [1.0, 2.0])
def test_fake_terrain_connects_west_and_east_at_fifteen_degrees(cell):
    grid = build_grid(json.loads(HANDOFF.read_text()), cell)
    slope = compute_slope(fake_elevation(grid), cell)
    components, _ = label((slope != 255) & (slope * 0.5 <= 15), np.ones((3, 3)))
    west = set(components[:, 0]) - {0}
    east = set(components[:, -1]) - {0}
    assert west & east, "The ravine must have a crossing or a gentle route around it"


def test_northwest_hillshade_lights_west_facing_plane_more_than_east():
    grid = build_grid(json.loads(HANDOFF.read_text()), 4)
    _, cols = np.indices(grid.inside.shape)
    west_facing = (cols * 4 * 0.2).astype("f4")
    brightness = []
    for z in [west_facing, -west_facing]:
        png = encode_files(grid, z)["frontend/public/data/gale-bx/hillshade.png"]
        with Image.open(io.BytesIO(png)) as im:
            brightness.append(np.asarray(im)[10:-10, 10:-10, 0].mean())
    assert brightness[0] > brightness[1]


def test_fake_cli_and_contract_coordinates(tmp_path):
    subprocess.run([sys.executable, str(ROOT / "scripts/make_fake_grid.py"),
                    "--output-root", str(tmp_path)], check=True)
    backend = tmp_path / "backend/data/gale-bx"
    frontend = tmp_path / "frontend/public/data/gale-bx"
    meta = json.loads((backend / "meta.json").read_text())
    assert (backend / "meta.json").read_bytes() == (frontend / "meta.json").read_bytes()
    contract = (ROOT / "docs/DATA_CONTRACT.md").read_text(encoding="utf-8")
    example = json.loads(contract.split('```json')[1].split('```')[0])
    assert set(meta) == set(example)
    assert meta["schema"] == "ares.grid/v1"
    assert meta["is_test_data"] is True
    w, h, cell = meta["width"], meta["height"], meta["cell_m"]
    assert (backend / "elevation.bin").stat().st_size == w * h * 4
    assert (backend / "slope.bin").stat().st_size == w * h
    z = np.fromfile(backend / "elevation.bin", dtype="<f4").reshape(h, w)
    slope = np.fromfile(backend / "slope.bin", dtype="u1").reshape(h, w)
    assert np.isfinite(z).any()
    assert np.all(slope[~np.isfinite(z)] == 255)
    for name in ["hillshade.png", "slope.png"]:
        with Image.open(frontend / name) as im:
            assert im.mode == "RGBA" and im.size == (w, h)
            assert np.all(np.asarray(im)[slope == 255, 3] == 0)
    bbox = meta["bbox"]
    r = meta["mars_radius_m"]
    lon0, lat0 = meta["center"]["lon"], meta["center"]["lat"]
    # NW, NE, SE, SW are OUTER edges; east/south are exclusive for indexing.
    for lon, lat, expected_col, expected_row in [
        (bbox["lon_min"], bbox["lat_max"], 0, 0),
        (bbox["lon_max"], bbox["lat_max"], w, 0),
        (bbox["lon_max"], bbox["lat_min"], w, h),
        (bbox["lon_min"], bbox["lat_min"], 0, h),
    ]:
        x = r * math.radians(lon - lon0) * math.cos(math.radians(lat0))
        y = r * math.radians(lat - lat0)
        assert (x - meta["x_min_m"]) / cell == pytest.approx(expected_col, abs=1e-7)
        assert (meta["y_max_m"] - y) / cell == pytest.approx(expected_row, abs=1e-7)
    row, col = h // 3, w // 3
    assert np.fromfile(backend / "elevation.bin", dtype="<f4")[row*w+col] == z[row, col]
    assert sum(p.stat().st_size for p in tmp_path.rglob("*") if p.is_file()) <= 3_000_000


@pytest.mark.parametrize("cell", [1.0, 2.0, 3.0])
def test_smoothed_plane_slope_and_nodata(cell):
    y, x = np.indices((80, 90)) * cell
    z = (0.1*x + 0.2*y).astype("f4")
    z[30:40, 30:40] = np.nan
    slope = compute_slope(z, cell)
    expected = round(math.degrees(math.atan(math.hypot(0.1, 0.2))) / 0.5)
    assert np.all(slope[10:20, 10:20] == expected)
    assert np.all(slope[30:40, 30:40] == 255)
    assert slope[29, 35] == 255  # Do not invent terrain at a data gap.
    assert slope.dtype == np.uint8


@pytest.mark.parametrize("cell, box, window", [(1.0, 5, 6.0), (2.0, 3, 8.0), (3.0, 1, 6.0)])
def test_slope_window_follows_cell_size(cell, box, window):
    # Box filter nearest 5 m, then a central difference: span = (box + 1) * cell.
    assert slope_grid.smoothing_cells(cell) == box
    assert slope_grid.slope_window_m(cell) == window
    assert build_grid(json.loads(HANDOFF.read_text()), cell).meta["slope_window_m"] == window


def test_real_reprojection_preserves_plane_and_source_nodata(tmp_path):
    handoff = json.loads(HANDOFF.read_text())
    grid = build_grid(handoff, 4)
    # Use the native DTM CRS (different central meridian and standard parallel).
    native_crs = handoff["native_dtm"]["crs_proj"]
    to_native = Transformer.from_crs(grid.crs, native_crs, always_xy=True)
    to_local = Transformer.from_crs(native_crs, grid.crs, always_xy=True)
    left, top = to_native.transform(grid.meta["x_min_m"]-40, grid.meta["y_max_m"]+40)
    transform = from_origin(left, top, 2, 2)
    h, w = grid.meta["height"]*2+40, grid.meta["width"]*2+40
    rows, cols = np.indices((h, w))
    x, y = to_local.transform(transform.c+(cols+0.5)*2, transform.f-(rows+0.5)*2)
    z = (100 + 0.1*x + 0.2*y).astype("f4")
    z[h//2-10:h//2+10, w//2-10:w//2+10] = -9999
    path = tmp_path / "plane.tif"
    with rasterio.open(path, "w", driver="GTiff", width=w, height=h, count=1,
                       dtype="float32", crs=native_crs, transform=transform, nodata=-9999) as dst:
        dst.write(z, 1)
    result = read_dtm(path, grid)
    assert np.isnan(result[grid.meta["height"]//2, grid.meta["width"]//2])
    expected = 100 + 0.1*(grid.transform.c+10.5*4) + 0.2*(grid.transform.f-10.5*4)
    assert result[10, 10] == pytest.approx(expected, abs=0.01)


def test_polygon_clipping_nodata_and_transparent_pngs(tmp_path):
    import io

    handoff = json.loads(HANDOFF.read_text())
    ring = handoff["aoi_proposal"]["aoi_geojson"]["coordinates"][0]
    # A triangular AOI leaves half of the bounding rectangle outside the AOI.
    handoff["aoi_proposal"]["aoi_geojson"]["coordinates"] = [[ring[0], ring[1], ring[2], ring[0]]]
    meta = generate(handoff, tmp_path, cell=2, fake=True)
    grid = build_grid(handoff, meta["cell_m"])   # the full AOI falls back to 3 m
    z = np.fromfile(tmp_path / "backend/data/gale-bx/elevation.bin", dtype="<f4").reshape(grid.inside.shape)
    assert np.isnan(z[~grid.inside]).all()
    assert np.isfinite(z[grid.inside]).all()
    slope = np.fromfile(tmp_path / "backend/data/gale-bx/slope.bin", dtype="u1").reshape(grid.inside.shape)
    assert np.all(slope[~grid.inside] == meta["slope_nodata"])
    for path, data in encode_files(grid, z).items():
        if path.endswith(".png"):
            with Image.open(io.BytesIO(data)) as im:
                assert np.all(np.asarray(im)[~grid.inside, 3] == 0)


def test_size_fallback_and_failure_do_not_publish_oversized_files(tmp_path, capsys):
    handoff = json.loads(HANDOFF.read_text())
    meta = generate(handoff, tmp_path, cell=0.5, fake=True)
    assert meta["cell_m"] == 3                   # 0.5 m -> 2 m -> 3 m for the full team AOI
    out = capsys.readouterr().out
    assert "--cell 2" in out and "--cell 3" in out
    backend = tmp_path / "backend/data/gale-bx"
    before = (backend / "meta.json").read_bytes()
    (backend / "stops.json").write_bytes(b" " * 3_000_000)
    with pytest.raises(ValueError, match="3 MB"):
        generate(handoff, tmp_path, cell=1, fake=True)
    assert (backend / "meta.json").read_bytes() == before


def test_reserve_triggers_fallback_even_when_grid_fits_total_limit(tmp_path, capsys, monkeypatch):
    assert slope_grid.RESERVE_BYTES == 100_000
    handoff = json.loads(HANDOFF.read_text())
    grid = build_grid(handoff, 1)
    grid.meta["is_test_data"] = True
    grid.meta["sources"] = ["Synthetic inclined plane, two hills and a ravine; NOT HiRISE terrain"]
    files = encode_files(grid, fake_elevation(grid))
    # The HUD's frontend elevation.bin copy is outside the budget.
    hud_copy = "frontend/public/data/gale-bx/elevation.bin"
    assert files[hud_copy] == files["backend/data/gale-bx/elevation.bin"]
    size = sum(len(data) for path, data in files.items() if path != hud_copy)
    # Place the total ceiling above the 1 m grid but its reserved ceiling below it.
    monkeypatch.setattr(slope_grid, "MAX_BYTES", size + 50_000)
    meta = generate(handoff, tmp_path, fake=True)
    assert meta["cell_m"] == 2
    assert "--cell 2" in capsys.readouterr().out
    written = [p for p in tmp_path.rglob("*") if p.is_file() and p.relative_to(tmp_path).as_posix() != hud_copy]
    assert sum(p.stat().st_size for p in written) <= size - 50_000


@pytest.mark.parametrize("thresholds", [None, (4, 8)])
def test_slope_png_uses_assumption_thresholds_or_defaults(tmp_path, thresholds):
    backend = tmp_path / "backend/data/gale-bx"
    backend.mkdir(parents=True)
    caution, limit = thresholds or (10, 15)
    if thresholds:
        (backend / "assumptions.json").write_text(json.dumps({
            "slope_caution_deg": caution, "slope_limit_deg": limit,
            "speed_kmh": 2, "items": [],
        }))
    meta = generate(json.loads(HANDOFF.read_text()), tmp_path, cell=2, fake=True)
    slope = np.fromfile(backend / "slope.bin", dtype="u1").reshape(meta["height"], meta["width"])
    with Image.open(tmp_path / "frontend/public/data/gale-bx/slope.png") as im:
        colors = np.asarray(im)
    steep = max(limit, slope_grid.STEEP_DEG)
    for mask, color in [
        (slope <= caution / 0.5, (75, 180, 110, 125)),
        ((slope > caution / 0.5) & (slope <= limit / 0.5), (245, 180, 65, 155)),
        ((slope > limit / 0.5) & (slope <= steep / 0.5), (220, 65, 60, 175)),
        ((slope > steep / 0.5) & (slope != 255), (120, 20, 20, 200)),
    ]:
        if mask.any():
            assert np.all(colors[mask] == color)
    # The browser copy of slope.bin is identical to the backend one.
    assert (tmp_path / "frontend/public/data/gale-bx/slope.bin").read_bytes() == (backend / "slope.bin").read_bytes()


def test_committed_real_grid_stops_and_assumptions_match_contract():
    backend = ROOT / "backend/data/gale-bx"
    meta = json.loads((backend / "meta.json").read_text())
    assert meta["is_test_data"] is False and meta["preliminary"] is True
    assert (backend / "meta.json").read_bytes() == (ROOT / "frontend/public/data/gale-bx/meta.json").read_bytes()
    assert (backend / "elevation.bin").stat().st_size == meta["width"] * meta["height"] * 4
    assert meta["slope_window_m"] == slope_grid.slope_window_m(meta["cell_m"])
    assumptions = json.loads((backend / "assumptions.json").read_text())
    assert set(assumptions) == {
        "slope_limit_deg",
        "slope_caution_deg",
        "speed_kmh",
        "eva_limit_s",
        "return_limit_m",
        "return_limit_s",
        "items",
    }
    assert assumptions["eva_limit_s"] == 28800
    assert [assumptions[k] for k in ["slope_limit_deg", "slope_caution_deg", "speed_kmh"]] == [15, 10, 2]
    assert len(assumptions["items"]) >= 2
    # Assumption and nullable StopImage shapes mirror frontend/src/api/types.ts.
    for item in assumptions["items"]:
        assert set(item) == {"name", "value", "source"}
        assert all(isinstance(value, str) and value for value in item.values())
        # A source is either a citation or is marked TO VERIFY (the interface then shows the tag).
        assert item["source"].strip()
    stops = json.loads((backend / "stops.json").read_text())
    sources = json.loads((backend / "sources.json").read_text())
    assert set(stops) == {"groups", "stops"}  # no "Why this site" text for now
    assert 3 <= len(stops["stops"]) <= 6
    ids = [stop["id"] for stop in stops["stops"]]
    assert len(set(ids)) == len(ids)
    assert stops["groups"] == [{"id": "boxwork", "name": "Boxwork", "stop_ids": ids}]
    rover = json.loads((ROOT / "docs/research/r0/rover_sols4534-4805.geojson").read_text())
    slope = np.fromfile(backend / "slope.bin", dtype="u1").reshape(meta["height"], meta["width"])
    components, _ = label((slope != 255) & (slope * meta["slope_unit_deg"] <= 15), np.ones((3, 3)))
    selected_components = []
    for stop in stops["stops"]:
        assert set(stop) == {"id", "name", "lon", "lat", "note", "image", "source_id"}
        assert all(isinstance(stop[k], str) and stop[k] for k in ["id", "name", "note", "source_id"])
        image = stop["image"]
        assert set(image) == {"url", "alt", "credit"} and all(image.values())
        assert image["url"].startswith("/app/stops/") and image["credit"].startswith("NASA/JPL-Caltech")
        assert (ROOT / "frontend/public" / image["url"].removeprefix("/app/")).is_file()
        assert f"{stop['source_id']}: {sources[stop['source_id']]}" in meta["sources"]
        matching = [f for f in rover["features"] if f["geometry"]["coordinates"][:2] == [stop["lon"], stop["lat"]]]
        assert len(matching) == 1
        assert str(matching[0]["properties"]["sol"]) in stop["note"]
        assert "docs/" not in stop["note"] and ".geojson" not in stop["note"]  # readable, no file paths
        bbox = meta["bbox"]
        assert bbox["lon_min"] <= stop["lon"] < bbox["lon_max"]
        assert bbox["lat_min"] < stop["lat"] <= bbox["lat_max"]
        x = meta["mars_radius_m"] * math.radians(stop["lon"]-meta["center"]["lon"]) * math.cos(math.radians(meta["center"]["lat"]))
        y = meta["mars_radius_m"] * math.radians(stop["lat"]-meta["center"]["lat"])
        row = math.floor((meta["y_max_m"]-y)/meta["cell_m"])
        col = math.floor((x-meta["x_min_m"])/meta["cell_m"])
        assert slope[row, col] != 255 and slope[row, col]*meta["slope_unit_deg"] <= 15
        selected_components.append(components[row, col])
    for first, second in zip(selected_components, selected_components[1:]):
        assert first == second and first != 0
    generated = [backend / name for name in ["meta.json", "elevation.bin", "slope.bin"]]
    generated += [ROOT / "frontend/public/data/gale-bx" / name for name in ["meta.json", "hillshade.png", "slope.png"]]
    assert sum(p.stat().st_size for p in generated) <= 3_000_000 - 100_000
    all_files = [p for directory in [backend, ROOT / "frontend/public/data/gale-bx"]
                 for p in directory.rglob("*") if p.is_file()]
    assert sum(p.stat().st_size for p in all_files) <= 3_000_000


@pytest.mark.parametrize("cell", [0, -1, float("nan"), float("inf")])
def test_invalid_cell_rejected(cell):
    with pytest.raises(ValueError, match="cell"):
        build_grid(json.loads(HANDOFF.read_text()), cell)
