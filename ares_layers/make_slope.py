"""Slope layer for the EVA planner.

WHAT: clip the HiRISE DTM to AOI + margin (in the DTM's own metres), block-average
      to ~5 m, compute slope with Horn's 3x3 method (Horn 1981, Proc. IEEE 69:14),
      write slope GeoTIFF + colour-classed PNG + JSON sidecar + 1 m hillshade PNG.
WHY:  the 10/15/20 deg lunar-analog thresholds were derived on 5 m data; 1 m slopes
      are steeper, so comparing 1 m slopes to them would over-flag terrain.
LIMITS: block factor is round(5 m / pixel) so true resolution is factor*pixel (~5.06 m).
      A block with ANY NoData pixel becomes NoData; a slope cell needs all 8 neighbours.
      DTM artifacts (stereo-matching errors) are NOT masked yet -- inspect the hillshade.
"""
import numpy as np
import rasterio
from rasterio.windows import transform as win_transform

import config as C
from ares_geo import aoi_window, read_masked, latlon_bounds, write_geotiff, write_png, write_json

COLORS = [(46, 160, 67), (240, 170, 0), (220, 40, 30), (110, 0, 0)]   # <=10, 10-15, 15-20, >20
GREY = (128, 128, 128)


def block_average(z, f):
    """Mean of f x f blocks; any masked pixel in a block -> NaN."""
    h, w = (z.shape[0] // f) * f, (z.shape[1] // f) * f
    d = np.ma.filled(z[:h, :w], np.nan).reshape(h // f, f, w // f, f)
    return d.mean(axis=(1, 3))                    # NaN propagates through mean


def horn_slope_deg(z, dx, dy):
    """Horn (1981) slope in degrees; border and NaN-neighbour cells are NaN."""
    p = np.pad(z, 1, constant_values=np.nan)
    a, b, c = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    d, f = p[1:-1, :-2], p[1:-1, 2:]
    g, h, i = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dx)
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * dy)
    s = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    return np.where(np.isnan(z), np.nan, s)          # Horn ignores the centre: mask it explicitly


def hillshade(z, px, az=315.0, alt=45.0):
    """0-255 hillshade (sun from NW) for visual artifact inspection only."""
    gy, gx = np.gradient(z, px)                   # gy: per row (southward), gx: eastward
    nx, ny, nz = -gx, gy, np.ones_like(z)         # surface normal (east, north, up)
    az, alt = np.radians(az), np.radians(alt)
    sun = np.array([np.sin(az) * np.cos(alt), np.cos(az) * np.cos(alt), np.sin(alt)])
    hs = (nx * sun[0] + ny * sun[1] + nz * sun[2]) / np.sqrt(nx**2 + ny**2 + 1)
    return np.clip(np.nan_to_num(hs, nan=0) * 255, 0, 255)


def classify(slope, thr):
    """Class index 0..3 per thresholds; -1 for NoData."""
    cls = np.digitize(slope, thr, right=True)     # <=10 ->0, (10,15]->1, (15,20]->2, >20->3
    return np.where(np.isfinite(slope), cls, -1)


def main():
    C.OUT.mkdir(exist_ok=True)
    with rasterio.open(C.DTM) as ds:
        px = abs(ds.transform.a)
        off = [(ds.transform.c - C.DTM_ORIGIN[0]) / px, (C.DTM_ORIGIN[1] - ds.transform.f) / px]
        if abs(px - C.DTM_PIXEL) > 1e-6 or any(abs(o - round(o)) > 1e-3 for o in off):
            print(f"WARNING: DTM grid differs from config (pixel {px} m, offset {off} px)")
        f = max(1, round(C.SLOPE_BASELINE_M / px))
        win = aoi_window(ds, C.AOI, C.MARGIN_M, block=f)
        z = read_masked(ds, win, C.NODATA_FLOOR)
        t1 = win_transform(win, ds.transform)
        crs = ds.crs

    zb = block_average(z, f)
    res = f * px
    slope = horn_slope_deg(zb, res, res)
    tb = t1 @ t1.scale(f, f)
    drv = write_geotiff(C.OUT / "slope.tif", slope, crs, tb)

    cls = classify(slope, C.SLOPE_THRESHOLDS["values"])
    rgba = np.zeros(cls.shape + (4,), "uint8")
    for k, col in enumerate(COLORS):
        rgba[cls == k] = col + (200,)
    rgba[cls == -1] = GREY + (160,)
    write_png(C.OUT / "slope.png", rgba)

    hs = hillshade(np.ma.filled(z, np.nan), px)
    write_png(C.OUT / "hillshade_1m.png", np.dstack([hs] * 3 + [np.where(np.ma.getmaskarray(z), 0, 255)]))

    valid = np.isfinite(slope)
    names = ["<=10", "10-15", "15-20", ">20"]
    write_json(C.OUT / "slope.json", {
        "layer": "slope_deg", "status": "MODEL (derived from archived DTM)", "mode": C.MODE,
        "bounds_latlon": latlon_bounds(crs, tb, *slope.shape),
        "crs_wkt": crs.to_wkt(), "resolution_m": res, "aggregation_factor": f,
        "native_pixel_m": px, "shape": list(slope.shape), "geotiff_driver": drv,
        "method": "block mean (any NoData -> NoData), then Horn 1981 3x3 slope",
        "thresholds_deg": C.SLOPE_THRESHOLDS,
        "stats": {"pct_per_class_of_valid": {n: round(100 * float((cls == k).sum()) / max(valid.sum(), 1), 2)
                                             for k, n in enumerate(names)},
                  "pct_nodata": round(100 * float((~valid).mean()), 2),
                  "slope_p50_p95_max": [float(np.nanpercentile(slope, q)) for q in (50, 95, 100)] if valid.any() else None},
        "provenance": {"dtm": C.DTM.name, "window_rowcol": [win.row_off, win.col_off, win.height, win.width],
                       "credit": "HiRISE DTM: NASA/JPL-Caltech/UArizona" if C.MODE == "real" else "SYNTHETIC test data"},
        "hillshade_png": "hillshade_1m.png, native 1 m, same bounds as slope",
        "known_limits": "No DTM artifact/FOM mask applied; lunar-analog thresholds [R].",
    })
    print(f"slope: {slope.shape} @ {res:.3f} m, {100 * (~valid).mean():.1f}% NoData -> {C.OUT}")


if __name__ == "__main__":
    main()
