"""SYNTHETIC test data -- NOT Mars data. For offline testing only.

WHAT: writes data_synthetic/SYNTHETIC_*.tif:
  - DTM: a sub-window of the REAL DTM grid (same CRS, pixel size, pixel-aligned origin)
         filled with an invented surface: 6 deg plane + one Gaussian mound + a NoData hole.
  - ortho: hillshade of that surface on a DIFFERENT grid (0.5 m, lon_0=137.39) to test warping.
  - themis: invented TI field (200..400) on a 100 m eqc grid with lon_0=0 to test clipping.
WHY:  NASA hosts are unreachable in the build sandbox; these files exercise every code path.
LIMITS: every value here is made up. Never use outputs from ARES_MODE=synthetic in the pitch.
"""
import os
import numpy as np
import rasterio
from rasterio.transform import from_origin

os.environ["ARES_MODE"] = "synthetic"
import config as C                                   # noqa: E402
from ares_geo import ll_to_xy                        # noqa: E402

SYN_PLANE_DEG = 6.0                                  # synthetic only


def write(path, arr, crs, t, nodata):
    with rasterio.open(path, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1,
                       dtype="float32", crs=crs, transform=t, nodata=nodata, compress="deflate") as d:
        d.write(arr.astype("float32"), 1)


def main():
    C.DATA.mkdir(exist_ok=True)
    px, (x0, y0) = C.DTM_PIXEL, C.DTM_ORIGIN
    xs, ys = ll_to_xy(C.DTM_CRS, [C.AOI["lon_min"], C.AOI["lon_max"]], [C.AOI["lat_max"], C.AOI["lat_min"]])
    pad = C.MARGIN_M + 200
    c0, r0 = int((xs[0] - pad - x0) // px), int((y0 - (ys[0] + pad)) // px)   # integer offsets
    c1, r1 = int((xs[1] + pad - x0) // px) + 1, int((y0 - (ys[1] - pad)) // px) + 1
    t = from_origin(x0 + c0 * px, y0 - r0 * px, px, px)
    h, w = r1 - r0, c1 - c0
    X = (np.arange(w) + 0.5) * px                     # metres east from window edge
    Y = (np.arange(h) + 0.5) * px                     # metres south from window edge
    XX, YY = np.meshgrid(X, Y)
    z = -1000.0 + np.tan(np.radians(SYN_PLANE_DEG)) * XX            # synthetic plane rising east
    z += 40.0 * np.exp(-(((XX - w * px / 2) ** 2 + (YY - h * px / 2) ** 2) / (2 * 120.0 ** 2)))
    z[h // 3:h // 3 + 60, w // 4:w // 4 + 60] = C.DTM_NODATA                    # NoData hole
    write(C.DTM, z, C.DTM_CRS, t, C.DTM_NODATA)

    # ortho on another grid: 0.5 m, different central meridian
    ocrs = C.DTM_CRS.replace(f"+lon_0={C.LON_0}", "+lon_0=137.39")
    ox, oy = ll_to_xy(ocrs, C.AOI["lon_min"] - 0.01, C.AOI["lat_max"] + 0.01)
    on = int(0.0222 / 180 * np.pi * C.MARS_R / 0.5 * 2)
    oyy, oxx = np.mgrid[0:on, 0:on] * 0.5
    img = 128 + 60 * np.sin(oxx / 25.0) * np.cos(oyy / 40.0)
    img[:50, :] = 0                                   # 0 = no image, like HiRISE
    write(C.ORTHO, img, ocrs, from_origin(ox, oy, 0.5, 0.5), 0)

    # THEMIS-like grid: simple cylindrical, lon_0=0, 100 m, invented TI values
    tcrs = f"+proj=eqc +lat_ts=0 +lon_0=0 +R={C.MARS_R} +units=m +no_defs"
    tx, ty = ll_to_xy(tcrs, C.AOI["lon_min"] - 0.05, C.AOI["lat_max"] + 0.05)
    ti = 200 + 200 * np.linspace(0, 1, 80)[None, :] * np.ones((80, 1))
    write(C.THERMAL, ti, tcrs, from_origin(np.floor(tx / 100) * 100, np.ceil(ty / 100) * 100, 100, 100), -9999)
    print(f"SYNTHETIC data written to {C.DATA} (DTM {h}x{w}, offset row {r0} col {c0} of real grid)")


if __name__ == "__main__":
    main()
