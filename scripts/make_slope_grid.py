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
import re

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
RESERVE_BYTES = 100_000
# Target width of the box filter that smooths DTM noise before the slope is taken.
SMOOTH_TARGET_M = 5
# Cell sizes tried in turn when the grid does not fit the 3 MB budget.
# The full team AOI (about 1.3 x 1.8 km) needs 3 m.
FALLBACK_CELLS = (2.0, 3.0)
# Upper display break of the slope layer (NASA EVA-EXP-0075 lunar suit design case, 20 deg).
STEEP_DEG = 20


@dataclass
class Grid:
    meta: dict
    crs: CRS
    transform: rasterio.Affine
    inside: np.ndarray


def site_id_of(handoff):
    """Folder name of the site under backend/data and frontend/public/data. gale-bx unless the handoff says."""
    sid = handoff.get("site_id", "gale-bx")
    if not isinstance(sid, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", sid):
        raise ValueError("handoff site_id must be lower-case letters, digits and hyphens")
    return sid


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
        "site_id": site_id_of(handoff),
        "name": handoff.get("site_name", "Gale crater: boxwork (Mount Sharp)"),
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
        "slope_window_m": slope_window_m(cell),
        "sources": [
            f"HiRISE DTM {handoff['dtm_product_id']}, NASA/JPL/University of Arizona",
        ],
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
    # Smoothly taper the ravine to zero towards the north, leaving a gentle bypass.
    north_fraction = np.clip((y + 100)/400, 0, 1)
    ravine_depth = 28 * (1 - north_fraction**2 * (3 - 2*north_fraction))
    z = (-2500 + 0.025*x + 0.015*y
         + 45*np.exp(-((x+140)/90)**2-((y-100)/110)**2)
         + 65*np.exp(-((x-150)/100)**2-((y+130)/95)**2)
         - ravine_depth*np.exp(-((x-35*np.sin(y/110))/22)**2))
    z[~grid.inside] = np.nan
    return z.astype("float32")


def smoothing_cells(cell):
    """Odd box-filter width in cells nearest SMOOTH_TARGET_M (5 at 1 m, 3 at 2 m, 1 at 3 m: no smoothing)."""
    return max(1, int(math.floor(SMOOTH_TARGET_M/cell/2))*2+1)


def slope_window_m(cell):
    """Horizontal span the slope at one cell is measured over, written to meta.json.

    The slope is a central difference (np.gradient) of box means, so along each axis it uses
    DTM cells from -(box+1)/2 to +(box+1)/2 around the cell. The span between the centres of
    those outermost cells is (box + 1) * cell: 6 m at 1 m, 8 m at 2 m, 6 m at 3 m.
    """
    return float((smoothing_cells(cell) + 1) * cell)


def smoothed_gradient(z, cell):
    size = smoothing_cells(cell)
    valid = np.isfinite(z)
    smooth = uniform_filter(np.where(valid, z, 0).astype("float64"), size=size, mode="nearest")
    # Require a complete smoothing window and its gradient neighbours. No gap filling.
    supported = minimum_filter(valid, size=size, mode="nearest")
    supported = minimum_filter(supported, size=3, mode="nearest")
    dy, dx = np.gradient(smooth, cell)
    return dx, dy, supported


def compute_slope(z, cell):
    return slope_from_gradient(*smoothed_gradient(z, cell))


def slope_from_gradient(dx, dy, valid):
    encoded = np.full(dx.shape, 255, dtype="uint8")
    degrees = np.degrees(np.arctan(np.hypot(dx, dy)))
    encoded[valid] = np.rint(degrees[valid]/0.5).astype("uint8")
    return encoded


def png_bytes(array):
    stream = io.BytesIO()
    Image.fromarray(array).save(stream, format="PNG", optimize=True)
    return stream.getvalue()


def encode_files(grid, z, caution_deg=10, limit_deg=15):
    dx, dy, valid = smoothed_gradient(z, grid.meta["cell_m"])
    slope = slope_from_gradient(dx, dy, valid)
    # Light from the northwest at 45 degrees; array y increases southwards.
    light = (dx*0.5 + dy*0.5 + math.sqrt(0.5))/np.sqrt(1+dx*dx+dy*dy)
    shade = np.rint(np.clip(light, 0, 1)*255).astype("uint8")
    hillshade = np.stack([shade, shade, shade, valid.astype("uint8")*255], axis=-1)
    colors = np.zeros((*z.shape, 4), dtype="uint8")
    degrees = slope.astype("float64") * grid.meta["slope_unit_deg"]
    # Display classes <=10 / 10-15 / 15-20 / >20 deg. All are lunar analogs, not Mars suit limits:
    # 15 deg Pena-Asensio et al. 2024 (doi:10.1016/j.actaastro.2023.10.010), 20 deg NASA EVA-EXP-0075
    # design case; 10 deg is a display break only.
    colors[(degrees <= caution_deg) & valid] = (75, 180, 110, 125)
    colors[(degrees > caution_deg) & (degrees <= limit_deg) & valid] = (245, 180, 65, 155)
    colors[(degrees > limit_deg) & (degrees <= STEEP_DEG) & valid] = (220, 65, 60, 175)
    colors[(degrees > max(limit_deg, STEEP_DEG)) & valid] = (120, 20, 20, 200)
    meta = (json.dumps(grid.meta, ensure_ascii=False, indent=2, allow_nan=False)+"\n").encode("utf-8")
    sid = grid.meta["site_id"]
    return {f"backend/data/{sid}/meta.json": meta,
            f"backend/data/{sid}/elevation.bin": z.astype("<f4").tobytes(order="C"),
            f"backend/data/{sid}/slope.bin": slope.tobytes(order="C"),
            f"frontend/public/data/{sid}/meta.json": meta,
            # Copy for the browser: a stop on a DTM gap or over the limit is refused on click.
            f"frontend/public/data/{sid}/slope.bin": slope.tobytes(order="C"),
            f"frontend/public/data/{sid}/hillshade.png": png_bytes(hillshade),
            f"frontend/public/data/{sid}/slope.png": png_bytes(colors)}


def read_stop_sources(data_dir):
    """Resolve only sources referenced by the current stops, without dataset-specific code."""
    stops_path = data_dir / "stops.json"
    if not stops_path.exists():
        return []
    stops = json.loads(stops_path.read_text(encoding="utf-8"))
    source_ids = dict.fromkeys(stop["source_id"] for stop in stops["stops"])
    if not source_ids:
        return []
    registry = json.loads((data_dir / "sources.json").read_text(encoding="utf-8"))
    sources = []
    for source_id in source_ids:
        description = registry.get(source_id)
        if not isinstance(description, str) or not description.strip():
            raise ValueError(f"sources.json has no description for stop source {source_id}")
        sources.append(f"{source_id}: {description}")
    return sources


def generate(handoff, output_root, cell=1.0, dtm=None, fake=False):
    output_root = Path(output_root)
    sid = site_id_of(handoff)
    stop_sources = [] if fake else read_stop_sources(output_root / f"backend/data/{sid}")
    assumptions_path = output_root / f"backend/data/{sid}/assumptions.json"
    if assumptions_path.exists():
        assumptions = json.loads(assumptions_path.read_text(encoding="utf-8"))
        caution_deg = assumptions.get("slope_caution_deg")
        limit_deg = assumptions.get("slope_limit_deg")
        if (any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                for v in [caution_deg, limit_deg])
                or not 0 <= caution_deg <= limit_deg <= 90):
            raise ValueError("assumptions.json requires finite 0 <= slope_caution_deg <= slope_limit_deg <= 90")
    else:
        caution_deg, limit_deg = 10, 15
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
            grid.meta["sources"].extend(stop_sources)
        files = encode_files(grid, z, caution_deg=caution_deg, limit_deg=limit_deg)
        # Include companion files such as stops.json and assumptions.json, if present.
        grid_bytes = sum(map(len, files.values()))
        total = grid_bytes
        for directory in [f"backend/data/{sid}", f"frontend/public/data/{sid}"]:
            for path in (output_root / directory).rglob("*"):
                if path.is_file() and path.relative_to(output_root).as_posix() not in files:
                    total += path.stat().st_size
        if grid_bytes <= MAX_BYTES - RESERVE_BYTES and total <= MAX_BYTES:
            break
        larger = [c for c in FALLBACK_CELLS if c > cell]
        if not larger:
            raise ValueError(f"3 MB limit or {RESERVE_BYTES}-byte reserve exceeded at cell={cell}: "
                             f"grid={grid_bytes}, total={total} bytes; nothing written")
        print(f"Grid={grid_bytes} bytes (budget {MAX_BYTES - RESERVE_BYTES}, "
              f"reserve {RESERVE_BYTES}); total={total} bytes (limit {MAX_BYTES}); "
              f"rebuilding with --cell {larger[0]:g}")
        cell = larger[0]
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
