"""Optical base image (HiRISE RED ortho) on the same AOI as the slope layer.

WHAT: warp the ortho (any CRS/resolution) onto a north-up grid in the DTM's CRS
      covering AOI + margin at OPTICAL_RES_M, stretch to 8-bit, write PNG + bounds JSON.
WHY:  so the photo, slope and route overlay pixel-for-pixel in the web map.
LIMITS: bilinear resampling for display only (not for measurement). Stretch is a
      0.5-99.5 percentile contrast stretch. Needs GDAL's JP2 driver for .JP2 files.
"""
import math
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT
from rasterio.windows import transform as win_transform

import config as C
from ares_geo import aoi_window, latlon_bounds, write_png, write_json


def target_grid():
    """Same AOI+margin box as make_slope (same block snapping), re-gridded at OPTICAL_RES_M."""
    with rasterio.open(C.DTM) as ds:
        f = max(1, round(C.SLOPE_BASELINE_M / abs(ds.transform.a)))
        win = aoi_window(ds, C.AOI, C.MARGIN_M, block=f)
        t = win_transform(win, ds.transform)
        crs = ds.crs
    w_m, h_m = win.width * t.a, win.height * -t.e
    r = C.OPTICAL_RES_M
    return crs, from_origin(t.c, t.f, r, r), math.ceil(h_m / r), math.ceil(w_m / r)


def main():
    C.OUT.mkdir(exist_ok=True)
    crs, t, h, w = target_grid()
    with rasterio.open(C.ORTHO) as src:
        nod = src.nodata if src.nodata is not None else 0   # HiRISE ortho: 0 = no image
        with WarpedVRT(src, crs=crs, transform=t, width=w, height=h,
                       resampling=Resampling.bilinear, src_nodata=nod, nodata=nod) as vrt:
            img = vrt.read(1, masked=True).astype("float64")
    valid = ~np.ma.getmaskarray(img)
    if not valid.any():
        raise SystemExit("ortho does not cover the AOI")
    lo, hi = np.percentile(img.compressed(), [0.5, 99.5])
    g = np.clip((np.ma.filled(img, lo) - lo) / max(hi - lo, 1e-9) * 255, 0, 255)
    write_png(C.OUT / "optical.png", np.dstack([g, g, g, np.where(valid, 255, 0)]))
    write_json(C.OUT / "optical.json", {
        "layer": "optical", "status": "ARCHIVED image (not live)", "mode": C.MODE,
        "bounds_latlon": latlon_bounds(crs, t, h, w), "resolution_m": C.OPTICAL_RES_M,
        "shape": [h, w], "crs_wkt": crs.to_wkt(), "source": C.ORTHO.name,
        "stretch_dn": [float(lo), float(hi)], "pct_covered": round(100 * float(valid.mean()), 2),
        "credit": C.OPTICAL_CREDIT,
    })
    print(f"optical: {h}x{w} @ {C.OPTICAL_RES_M} m, {100 * valid.mean():.1f}% covered")


if __name__ == "__main__":
    main()
