"""Thermal inertia layer (THEMIS quantitative TI mosaic).

WHAT: clip the 100 m/px TI mosaic to AOI + margin in its OWN CRS, keep native values
      (no resampling) in a GeoTIFF; make a display PNG (nearest upscale + colour bar).
WHY:  thermal inertia hints at loose sand (low TI) vs rock/cemented ground (high TI).
LIMITS: this is thermal inertia, NOT temperature. 100 m pixels -> the AOI is only
      ~20x30 pixels; ~20% absolute accuracy (Fergason et al. 2006). Context layer only.
"""
import numpy as np
import rasterio
from PIL import Image, ImageDraw
from rasterio.windows import transform as win_transform

import config as C
from ares_geo import aoi_window, read_masked, latlon_bounds, write_geotiff, write_png, write_json

STOPS = np.array([[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]], float)


def colormap(v01):
    """Linear 5-stop viridis-like ramp; v01 in [0,1] -> RGB uint8."""
    x = np.clip(v01, 0, 1) * (len(STOPS) - 1)
    i = np.minimum(x.astype(int), len(STOPS) - 2)
    return (STOPS[i] + (STOPS[i + 1] - STOPS[i]) * (x - i)[..., None]).astype("uint8")


def main():
    C.OUT.mkdir(exist_ok=True)
    with rasterio.open(C.THERMAL) as ds:
        win = aoi_window(ds, C.AOI, C.MARGIN_M)
        ti = read_masked(ds, win, C.NODATA_FLOOR)
        t, crs, px = win_transform(win, ds.transform), ds.crs, abs(ds.transform.a)
    if ti.count() == 0:
        raise SystemExit("no valid TI pixels in AOI")
    write_geotiff(C.OUT / "thermal_ti.tif", np.ma.filled(ti, np.nan), crs, t)

    lo, hi = float(ti.min()), float(ti.max())
    rgb = colormap((np.ma.filled(ti, lo) - lo) / max(hi - lo, 1e-9))
    rgba = np.dstack([rgb, np.where(ti.mask, 0, 220).astype("uint8")])
    s = C.THERMAL_PNG_SCALE
    write_png(C.OUT / "thermal_ti.png", rgba.repeat(s, 0).repeat(s, 1))   # exact overlay, no bar

    # separate legend image so the overlay keeps exact geographic bounds
    bar = Image.new("RGB", (320, 50), "white")
    bar.paste(Image.fromarray(np.tile(colormap(np.linspace(0, 1, 300))[None], (20, 1, 1))), (10, 5))
    d = ImageDraw.Draw(bar)
    d.text((10, 28), f"{lo:.0f}", fill="black")
    d.text((250, 28), f"{hi:.0f}", fill="black")
    d.text((80, 28), "TI, J m-2 K-1 s-1/2", fill="black")
    bar.save(C.OUT / "thermal_ti_colorbar.png")

    write_json(C.OUT / "thermal_ti.json", {
        "layer": "thermal_inertia", "status": "ARCHIVED mosaic (not live)", "mode": C.MODE,
        "label": "Thermal inertia (not temperature), 100 m/px, ~20% absolute accuracy",
        "units": "J m^-2 K^-1 s^-1/2", "native_pixel_m": px, "shape": list(ti.shape),
        "bounds_latlon": latlon_bounds(crs, t, *ti.shape), "crs_wkt": crs.to_wkt(),
        "stats": {"min": lo, "max": hi, "mean": float(ti.mean()), "n_valid": int(ti.count())},
        "display": f"nearest-neighbour x{s} upscale, colour range = clip min..max",
        "source": C.THERMAL.name, "credit": C.THERMAL_CREDIT,
    })
    print(f"thermal: {ti.shape} px @ {px:.0f} m, TI {lo:.0f}..{hi:.0f}")


if __name__ == "__main__":
    main()
