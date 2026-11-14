"""Shared geometry + writing helpers.

WHAT: lat/lon <-> map metres, AOI pixel windows, masked reads, PNG/JSON/GeoTIFF writers.
WHY:  every layer must use the SAME conversion. Lat/lon is always converted on
      the raster's own geodetic CRS (Mars sphere), never WGS84 (Earth).
LIMITS: assumes north-up rasters (no rotation terms in the geotransform).
"""
import json
import math
import numpy as np
import rasterio
from PIL import Image
from pyproj import CRS, Transformer
from rasterio.windows import Window


def _tr(crs, inverse=False):
    crs = CRS.from_user_input(crs)
    geo = crs.geodetic_crs                      # Mars lat/lon of the same body
    a, b = (crs, geo) if inverse else (geo, crs)
    return Transformer.from_crs(a, b, always_xy=True)


def ll_to_xy(crs, lon, lat):
    return _tr(crs).transform(lon, lat)


def xy_to_ll(crs, x, y):
    return _tr(crs, inverse=True).transform(x, y)


def aoi_window(ds, aoi, margin_m, block=1):
    """Pixel window covering AOI + margin, snapped outward to `block` pixels and clipped to the raster."""
    xs, ys = ll_to_xy(ds.crs, [aoi["lon_min"], aoi["lon_max"]] * 2,
                      [aoi["lat_min"]] * 2 + [aoi["lat_max"]] * 2)
    inv = ~ds.transform
    c0, r0 = inv @ (min(xs) - margin_m, max(ys) + margin_m)
    c1, r1 = inv @ (max(xs) + margin_m, min(ys) - margin_m)
    c0, r0 = max(0, math.floor(c0 / block) * block), max(0, math.floor(r0 / block) * block)
    c1 = min(ds.width - ds.width % block, math.ceil(c1 / block) * block)
    r1 = min(ds.height - ds.height % block, math.ceil(r1 / block) * block)
    if c1 <= c0 or r1 <= r0:
        raise SystemExit("AOI does not overlap the raster -- check lat/lon order and CRS")
    return Window(c0, r0, c1 - c0, r1 - r0)


def read_masked(ds, window, floor=-1e30):
    """Band 1 as float64 masked array; NoData, non-finite and huge negatives are masked. Applies scale/offset (ISIS cubes)."""
    a = ds.read(1, window=window, masked=True).astype("float64")
    a = a * (ds.scales[0] or 1.0) + (ds.offsets[0] or 0.0)
    bad = np.ma.getmaskarray(a) | ~np.isfinite(a.data) | (a.data < floor)
    return np.ma.array(a.data, mask=bad)


def latlon_bounds(crs, transform, h, w):
    """Leaflet-order bounds [[south, west], [north, east]] of a grid (eqc grids are linear in lat/lon)."""
    xs = [transform.c, transform.c + w * transform.a]
    ys = [transform.f, transform.f + h * transform.e]
    lon, lat = xy_to_ll(crs, [xs[0], xs[1], xs[0], xs[1]], [ys[0], ys[0], ys[1], ys[1]])
    return [[min(lat), min(lon)], [max(lat), max(lon)]]


def write_geotiff(path, arr, crs, transform, nodata=-9999.0):
    """Float32 GeoTIFF; COG if the driver exists, plain tiled GTiff otherwise."""
    arr = np.where(np.isfinite(arr), arr, nodata).astype("float32")
    prof = dict(height=arr.shape[0], width=arr.shape[1], count=1, dtype="float32",
                crs=crs, transform=transform, nodata=nodata, compress="deflate")
    for drv in ("COG", "GTiff"):
        try:
            with rasterio.open(path, "w", driver=drv, **prof) as dst:
                dst.write(arr, 1)
            return drv
        except Exception:
            continue
    raise RuntimeError(f"could not write {path}")


def write_png(path, rgba):
    Image.fromarray(np.ascontiguousarray(rgba).astype("uint8")).save(path)


def write_json(path, d):
    with open(path, "w") as f:
        json.dump(d, f, indent=2, default=float)
