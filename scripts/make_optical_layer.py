"""Turn the HiRISE orthoimage into the optical layer image of a site.

Input: PSP_009149_1750_RED_C_01_ORTHO.JP2 (or RED_A) from the HiRISE DTM page, same stereo pair
as the DTM. Output, on the exact grid of frontend/public/data/<site>/meta.json (same local Mars
projection and bbox, so the frontend places it with the site bbox like slope.png):

  frontend/public/imagery/<site>/optical.jpg   greyscale, 1 m per pixel, 0.5-99.5 % stretch
  frontend/public/imagery/<site>/optical.json  source, credit, label, bbox, stretch

The image lives outside data/<site>/ so it does not count against the 3 MB grid budget.
Average resampling (display only, not for measurement).

    python -m scripts.make_optical_layer /path/to/PSP_009149_1750_RED_C_01_ORTHO.JP2
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
import rasterio
from pyproj import CRS
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

ROOT = Path(__file__).resolve().parents[1]
SITE = "gale-bx"
CELL_M = 1.0
LABEL = ("HiRISE orthoimage PSP_009149_1750 (MRO), same stereo pair as the DTM, "
         "acquired 9 Jul 2008.")
CREDIT = "NASA/JPL-Caltech/UArizona"
PAGE_URL = "https://www.uahirise.org/dtm/PSP_009149_1750"


def site_grid(meta):
    lon0, lat0 = meta["center"]["lon"], meta["center"]["lat"]
    crs = CRS.from_proj4(f"+proj=eqc +lat_ts={lat0} +lat_0={lat0} +lon_0={lon0} "
                         f"+R={meta['mars_radius_m']} +units=m +no_defs")
    w_m, h_m = meta["width"] * meta["cell_m"], meta["height"] * meta["cell_m"]
    width, height = round(w_m / CELL_M), round(h_m / CELL_M)
    return crs, from_origin(meta["x_min_m"], meta["y_max_m"], CELL_M, CELL_M), width, height


def build(ortho, output_root=ROOT, site=SITE):
    meta = json.loads((output_root / f"frontend/public/data/{site}/meta.json").read_text(encoding="utf-8"))
    crs, transform, width, height = site_grid(meta)
    img = np.full((height, width), np.nan, dtype="float32")
    with rasterio.open(ortho) as src:
        nodata = src.nodata if src.nodata is not None else 0   # HiRISE ortho: 0 = no image
        reproject(rasterio.band(src, 1), img, src_nodata=nodata, dst_transform=transform,
                  dst_crs=crs, dst_nodata=np.nan, resampling=Resampling.average)
    valid = np.isfinite(img)
    if not valid.any():
        raise ValueError("orthoimage does not cover the site")
    lo, hi = (float(v) for v in np.percentile(img[valid], [0.5, 99.5]))
    grey = np.clip((np.where(valid, img, lo) - lo) / max(hi - lo, 1e-9) * 255, 0, 255)
    out = output_root / f"frontend/public/imagery/{site}"
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.rint(grey).astype("uint8")).save(out / "optical.jpg", quality=82, optimize=True)
    info = {
        "schema": "ares.optical/v1", "layer": "optical", "file": "optical.jpg", "site_id": site,
        "label": LABEL, "credit": CREDIT, "page_url": PAGE_URL, "source_file": Path(ortho).name,
        "pixel_m": CELL_M, "width": width, "height": height, "bbox": meta["bbox"],
        "covered_percent": round(100 * float(valid.mean()), 2),
        "stretch_dn": [lo, hi], "resampling": "average, display only",
    }
    (out / "optical.json").write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
    print(f"optical.jpg {width}x{height}, {CELL_M:g} m per pixel, {info['covered_percent']}% covered")
    return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ortho", type=Path, help="HiRISE ORTHO .JP2 of the DTM stereo pair")
    parser.add_argument("--output-root", type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        build(args.ortho, args.output_root)
    except (ValueError, OSError, rasterio.errors.RasterioError) as exc:
        parser.exit(1, f"Error: {exc}\n")


if __name__ == "__main__":
    main()
