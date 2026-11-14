"""Build the north-up Mars grid defined in docs/DATA_CONTRACT.md.

Pixel coordinates in the contract refer to outer edges; sample centres are
(col + 0.5, row + 0.5). The snapped grid encloses the AOI; pixels whose centres
are outside its polygon are NoData. No Earth CRS is used.
"""

import argparse
from dataclasses import dataclass
import io
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import CRS, Transformer
import rasterio
from rasterio.features import geometry_mask
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from scipy.ndimage import minimum_filter, uniform_filter
from shapely.geometry import mapping, shape
from shapely.ops import transform as transform_geometry


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HANDOFF = ROOT / "docs/research/r0/gale_bx_handoff.json"
RADIUS = 3396190
MAX_BYTES = 3_000_000
WINDOW_M = 5


@dataclass
class Grid:
    meta: dict
    crs: CRS
    transform: rasterio.Affine
    inside: np.ndarray


def build_grid(handoff, cell):
    if not math.isfinite(cell) or cell <= 0:
        raise ValueError("cell must be finite and positive")
    proposal = handoff["aoi_proposal"]
    lon0, lat0 = proposal["centre_lonlat_E"]
    crs = CRS.from_user_input(proposal["crs_proj"])
    expected = CRS.from_proj4(
        f"+proj=eqc +lat_ts={lat0} +lat_0={lat0} +lon_0={lon0} +R={RADIUS} +units=m"
    )
    if not crs.equals(expected):
        raise ValueError("handoff crs_proj does not match the contract's local Mars projection")
    polygon = shape(proposal["aoi_geojson"])
    if polygon.geom_type != "Polygon" or not polygon.is_valid or polygon.is_empty:
        raise ValueError("AOI must be a nonempty valid Polygon")
    forward = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    projected = transform_geometry(forward.transform, polygon)
    left, bottom, right, top = projected.bounds
    left, bottom = math.floor(left/cell)*cell, math.floor(bottom/cell)*cell
    right, top = math.ceil(right/cell)*cell, math.ceil(top/cell)*cell
    width, height = round((right-left)/cell), round((top-bottom)/cell)
    if min(width, height) < 2:
        raise ValueError("AOI must span at least two rows and columns")
    affine = from_origin(left, top, cell, cell)
    inside = geometry_mask([mapping(projected)], (height, width), affine, invert=True)
    # Derive bbox from the actual outer grid edges, using the contract formulas.
    lon_scale = RADIUS * math.cos(math.radians(lat0))
    meta = {
        "schema": "ares.grid/v1",
        "site_id": "gale-bx",
        "name": "Gale crater: boxwork (Mount Sharp)",
        "preliminary": True,
        "dtm_product_id": handoff["dtm_product_id"],
        "is_test_data": False,
        "width": width,
        "height": height,
        "cell_m": float(cell),
        "mars_radius_m": RADIUS,
        "center": {"lon": lon0, "lat": lat0},
        "bbox": {"lon_min": lon0+math.degrees(left/lon_scale),
                 "lon_max": lon0+math.degrees(right/lon_scale),
                 "lat_min": lat0+math.degrees(bottom/RADIUS),
                 "lat_max": lat0+math.degrees(top/RADIUS)},
        "x_min_m": left,
        "y_max_m": top,
        "elevation_nodata": "NaN",
        "slope_unit_deg": 0.5,
        "slope_nodata": 255,
        "slope_window_m": WINDOW_M,
        "sources": [f"HiRISE DTM {handoff['dtm_product_id']}, NASA/JPL/University of Arizona"],
    }
    return Grid(meta, crs, affine, inside)


def read_dtm(path, grid):
    """GDAL reads only source blocks needed for the AOI, including PDS IMG."""
    z = np.full(grid.inside.shape, np.nan, dtype="float32")
    with rasterio.open(path) as src:
        if src.crs is None:
            raise ValueError("DTM has no CRS; cannot reproject safely")
        reproject(source=rasterio.band(src, 1), destination=z,
                  src_transform=src.transform, src_crs=src.crs, src_nodata=src.nodata,
                  dst_transform=grid.transform, dst_crs=grid.crs,
                  dst_nodata=np.nan, resampling=Resampling.bilinear)
    z[~np.isfinite(z) | ~grid.inside] = np.nan
    if not np.isfinite(z).any():
        raise ValueError("DTM has no valid elevation within the AOI")
    return z


def fake_elevation(grid):
    rows, cols = np.indices(grid.inside.shape, dtype="float64")
    cell = grid.meta["cell_m"]
    x = grid.transform.c + (cols+0.5)*cell
    y = grid.transform.f - (rows+0.5)*cell
    z = (-2500 + 0.025*x + 0.015*y
         + 45*np.exp(-((x+140)/90)**2-((y-100)/110)**2)
         + 65*np.exp(-((x-150)/100)**2-((y+130)/95)**2)
         - 28*np.exp(-((x-35*np.sin(y/110))/22)**2))
    z[~grid.inside] = np.nan
    return z.astype("float32")


def smoothed_gradient(z, cell):
    # Nearest odd box width to 5 m (5 pixels at 1 m, 3 at 2 m).
    size = max(1, int(math.floor(WINDOW_M/cell/2))*2+1)
    valid = np.isfinite(z)
    smooth = uniform_filter(np.where(valid, z, 0).astype("float64"), size=size, mode="nearest")
    # Require a complete smoothing window and its gradient neighbours. No gap filling.
    supported = minimum_filter(valid, size=size, mode="nearest")
    supported = minimum_filter(supported, size=3, mode="nearest")
    dy, dx = np.gradient(smooth, cell)
    return dx, dy, supported


def compute_slope(z, cell):
    dx, dy, valid = smoothed_gradient(z, cell)
    encoded = np.full(z.shape, 255, dtype="uint8")
    degrees = np.degrees(np.arctan(np.hypot(dx, dy)))
    encoded[valid] = np.rint(degrees[valid]/0.5).astype("uint8")
    return encoded


def png_bytes(array):
    stream = io.BytesIO()
    Image.fromarray(array).save(stream, format="PNG", optimize=True)
    return stream.getvalue()


def encode_files(grid, z):
    slope = compute_slope(z, grid.meta["cell_m"])
    dx, dy, valid = smoothed_gradient(z, grid.meta["cell_m"])
    # Light from the northwest at 45 degrees; array y increases southwards.
    light = (-dx*0.5 + dy*0.5 + math.sqrt(0.5))/np.sqrt(1+dx*dx+dy*dy)
    shade = np.rint(np.clip(light, 0, 1)*255).astype("uint8")
    hillshade = np.stack([shade, shade, shade, valid.astype("uint8")*255], axis=-1)
    colors = np.zeros((*z.shape, 4), dtype="uint8")
    colors[slope <= 20] = (75, 180, 110, 125)
    colors[(slope > 20) & (slope <= 30)] = (245, 180, 65, 155)
    colors[(slope > 30) & (slope != 255)] = (220, 65, 60, 175)
    meta = (json.dumps(grid.meta, ensure_ascii=False, indent=2, allow_nan=False)+"\n").encode("utf-8")
    return {"backend/data/gale-bx/meta.json": meta,
            "backend/data/gale-bx/elevation.bin": z.astype("<f4").tobytes(order="C"),
            "backend/data/gale-bx/slope.bin": slope.tobytes(order="C"),
            "frontend/public/data/gale-bx/meta.json": meta,
            "frontend/public/data/gale-bx/hillshade.png": png_bytes(hillshade),
            "frontend/public/data/gale-bx/slope.png": png_bytes(colors)}


def generate(handoff, output_root, cell=1.0, dtm=None, fake=False):
    output_root = Path(output_root)
    while True:
        grid = build_grid(handoff, cell)
        if fake:
            grid.meta["is_test_data"] = True
            grid.meta["sources"] = ["Synthetic inclined plane, two hills and a ravine; NOT HiRISE terrain"]
            z = fake_elevation(grid)
        else:
            if dtm is None:
                raise ValueError("DTM path is required")
            z = read_dtm(dtm, grid)
        files = encode_files(grid, z)
        # Include companion files such as stops.json and assumptions.json, if present.
        total = sum(map(len, files.values()))
        for directory in ["backend/data/gale-bx", "frontend/public/data/gale-bx"]:
            for path in (output_root / directory).rglob("*"):
                if path.is_file() and path.relative_to(output_root).as_posix() not in files:
                    total += path.stat().st_size
        if total <= MAX_BYTES:
            break
        if cell >= 2:
            raise ValueError(f"Grid still exceeds 3 MB at cell={cell}: {total} bytes; nothing written")
        print(f"Grid is {total} bytes (>3 MB); rebuilding with --cell 2")
        cell = 2.0
    # Do not publish the oversized first attempt.
    for relative, data in files.items():
        path = output_root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    print(f"Wrote {grid.meta['width']} x {grid.meta['height']}, cell={cell:g} m, "
          f"{total} bytes, is_test_data={fake}")
    return grid.meta


def main(fake=False):
    parser = argparse.ArgumentParser(description=__doc__)
    if not fake:
        parser.add_argument("dtm", type=Path, help="Mars DTM GeoTIFF or PDS IMG")
    parser.add_argument("--handoff", type=Path, default=DEFAULT_HANDOFF)
    parser.add_argument("--cell", type=float, default=1.0)
    parser.add_argument("--output-root", type=Path, default=ROOT,
                        help="Repository root (override for isolated verification)")
    args = parser.parse_args()
    try:
        handoff = json.loads(args.handoff.read_text(encoding="utf-8"))
        generate(handoff, args.output_root, args.cell, dtm=None if fake else args.dtm, fake=fake)
    except (ValueError, OSError, rasterio.errors.RasterioError) as exc:
        parser.exit(1, f"Error: {exc}\n")


if __name__ == "__main__":
    main()
