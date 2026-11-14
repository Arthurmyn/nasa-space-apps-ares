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


ROOT = Path(__file__).resolve().parents[2]
HANDOFF = ROOT / "docs/research/r0/gale_bx_handoff.json"


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


@pytest.mark.parametrize("cell", [1.0, 2.0])
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
    grid = build_grid(handoff, 2)
    meta = generate(handoff, tmp_path, cell=2, fake=True)
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
    assert meta["cell_m"] == 2
    assert "--cell 2" in capsys.readouterr().out
    backend = tmp_path / "backend/data/gale-bx"
    before = (backend / "meta.json").read_bytes()
    (backend / "stops.json").write_bytes(b" " * 3_000_000)
    with pytest.raises(ValueError, match="3 MB"):
        generate(handoff, tmp_path, cell=1, fake=True)
    assert (backend / "meta.json").read_bytes() == before


@pytest.mark.parametrize("cell", [0, -1, float("nan"), float("inf")])
def test_invalid_cell_rejected(cell):
    with pytest.raises(ValueError, match="cell"):
        build_grid(json.loads(HANDOFF.read_text()), cell)
