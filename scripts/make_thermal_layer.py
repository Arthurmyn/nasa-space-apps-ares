"""Turn the USGS Gale THEMIS daytime IR cube into the thermal layer image of a site.

Input: the ISIS2/PDS cube downloaded from USGS Astropedia, see ASSETS.md for the URL and credit.
Output (docs/DATA_CONTRACT.md, section 2b), next to hillshade.png and slope.png:

  frontend/public/data/<site>/thermal.png   RGBA, width x height of the site grid, bbox of meta.json
  frontend/public/data/<site>/thermal.json  source, pixel size, value range, colormap, caveats
  backend/data/<site>/thermal.json          copy; the API reads it to report the layer as available

Nothing is interpolated. Each output pixel takes the value of the one THEMIS pixel (100 m) that
contains its centre, so the image shows the real, coarse pixels as blocks. Pixels whose value is
the cube's null value (0) are transparent.

    python -m scripts.make_thermal_layer /path/to/gale_crater_themis_dayir_isis.cub
"""

import argparse
import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image
import rasterio

ROOT = Path(__file__).resolve().parents[1]
SITE = "gale-bx"
CUBE_URL = (
    "https://astrogeology.usgs.gov/ckan/dataset/0e7eae1a-a29c-4ea6-8eee-8ebce2deb079/"
    "resource/374f1c54-b81e-47ce-8b6f-f4b7daa40163/download/gale_crater_themis_dayir_isis.cub"
)
PAGE_URL = "https://astrogeology.usgs.gov/search/map/gale_crater_themis_daytime_ir_isis"
TEAM_URL = "https://themis.mars.asu.edu/landingsites"

# Colormap: 5 stops sampled from matplotlib's "inferno" (CC0), linear between stops.
# Position 0 is the lowest value inside the site, position 1 the highest.
COLORMAP = {
    "name": "inferno, 5 stops, linear between stops",
    "stops": [[0.0, "#000004"], [0.25, "#57106e"], [0.5, "#bc3754"], [0.75, "#f98e09"], [1.0, "#fcffa4"]],
}


def read_label(path: Path) -> dict:
    """Values of the PDS label keywords this script needs. The label is plain text at the start."""
    text = path.read_bytes()[:60000].decode("latin1")
    text = text[: text.find("\nEND\n") + 5] if "\nEND\n" in text else text
    found = {}
    for key in (
        "PRODUCT_ID",
        "DATA_SET_ID",
        "CORE_NAME",
        "CORE_UNIT",
        "CORE_NULL",
        "BAND_BIN_CENTER",
        "BAND_BIN_ORIGINAL_BAND",
        "INSTRUMENT_ID",
        "MAP_SCALE",
        "LATITUDE_TYPE",
        "KEYWORD_LATITUDE_TYPE",
        "CENTER_LONGITUDE",
        "A_AXIS_RADIUS",
    ):
        m = re.search(rf"^\s*{key}\s*=\s*(.+?)\s*$", text, re.M)
        if m:
            found[key] = m.group(1).strip('"')
    m = re.search(r'START_TIME\s*=\s*\("([^"]+)","(\d+)","([\d.]+)Z"\)', text)
    if m:
        found["START_TIME"] = f"{m.group(1)}:{m.group(2)}:{m.group(3)}Z"
    return found


def sample_nearest(
    values: np.ndarray, left: float, top: float, pixel_m: float, xs: np.ndarray, ys: np.ndarray
):
    """Nearest-pixel lookup. xs, ys are map coordinates in metres; returns (values, inside)."""
    cols = np.floor((xs - left) / pixel_m).astype(int)
    rows = np.floor((top - ys) / pixel_m).astype(int)
    inside = (rows >= 0) & (rows < values.shape[0]) & (cols >= 0) & (cols < values.shape[1])
    out = np.zeros(xs.shape, dtype=values.dtype)
    out[inside] = values[rows[inside], cols[inside]]
    return out, inside


def site_pixel_centres(meta: dict):
    """Map coordinates in the cube's projection for the centre of every pixel of the site grid.

    The site grid is the local projection of docs/DATA_CONTRACT.md, section 4. The cube is simple
    cylindrical (planetocentric latitude, longitude east, central meridian 180), on the same sphere.
    """
    radius = float(meta["mars_radius_m"])
    lon0, lat0 = meta["center"]["lon"], meta["center"]["lat"]
    cols = np.arange(meta["width"]) + 0.5
    rows = np.arange(meta["height"]) + 0.5
    x_local = meta["x_min_m"] + cols * meta["cell_m"]
    y_local = meta["y_max_m"] - rows * meta["cell_m"]
    lon = lon0 + np.degrees(x_local / (radius * math.cos(math.radians(lat0))))
    lat = lat0 + np.degrees(y_local / radius)
    lon_grid, lat_grid = np.meshgrid(lon, lat)
    xs = radius * np.radians(lon_grid - 180.0)
    ys = radius * np.radians(lat_grid)
    return xs, ys


def colorize(dn: np.ndarray, valid: np.ndarray, low: float, high: float) -> np.ndarray:
    """RGBA image: DN scaled between low and high through COLORMAP; invalid pixels transparent."""
    stops = COLORMAP["stops"]
    pos = np.array([s[0] for s in stops])
    rgb = np.array([[int(s[1][i : i + 2], 16) for i in (1, 3, 5)] for s in stops], dtype=float)
    t = np.full(dn.shape, 0.5) if high <= low else np.clip((dn - low) / (high - low), 0, 1)
    out = np.zeros((*dn.shape, 4), dtype=np.uint8)
    for channel in range(3):
        out[..., channel] = np.rint(np.interp(t, pos, rgb[:, channel])).astype(np.uint8)
    out[..., 3] = np.where(valid, 255, 0)
    return out


def build(cube: Path, root: Path = ROOT, site: str = SITE) -> dict:
    meta_path = root / "backend/data" / site / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    label = read_label(cube)
    with rasterio.open(cube) as src:
        if src.count != 1 or abs(src.res[0] - src.res[1]) > 1e-9:
            raise ValueError("expected a one-band cube with square pixels")
        pixel_m = float(src.res[0])
        left, top = src.bounds.left, src.bounds.top
        data = src.read(1)
        spheroid = re.search(r'SPHEROID\["MARS",([\d.]+)', src.crs.to_wkt())
    if not spheroid or abs(float(spheroid.group(1)) - meta["mars_radius_m"]) > 1:
        raise ValueError("cube sphere differs from mars_radius_m of meta.json")
    null_dn = int(float(label.get("CORE_NULL", 0)))
    if null_dn != 0:
        raise ValueError("the THEMIS team's ignore value is 0; this cube says otherwise")

    xs, ys = site_pixel_centres(meta)
    dn, inside = sample_nearest(data, left, top, pixel_m, xs, ys)
    valid = inside & (dn != null_dn)
    if not valid.any():
        raise ValueError("the cube has no valid pixels inside the site bbox")
    low, high = int(dn[valid].min()), int(dn[valid].max())

    image = colorize(dn.astype(float), valid, low, high)
    out_dir = root / "frontend/public/data" / site
    out_dir.mkdir(parents=True, exist_ok=True)
    Image.fromarray(image, "RGBA").save(out_dir / "thermal.png", optimize=True)

    # How many distinct THEMIS pixels the site covers, to say plainly how coarse it is.
    cols = np.floor((xs - left) / pixel_m).astype(int)
    rows = np.floor((top - ys) / pixel_m).astype(int)
    distinct = len({(int(r), int(c)) for r, c in zip(rows[valid], cols[valid], strict=True)})

    info = {
        "schema": "ares.thermal/v1",
        "layer": "thermal",
        "file": "thermal.png",
        "site_id": site,
        "source": {
            "title": "Gale Crater THEMIS Daytime IR ISIS",
            "page_url": PAGE_URL,
            "download_url": CUBE_URL,
            "team_page_url": TEAM_URL,
            "credit": "NASA/JPL-Caltech/Arizona State University (Mars Odyssey THEMIS); USGS Astrogeology Science Center",
            "license": "THEMIS Citation Policy, https://themis.asu.edu/terms: credit NASA/JPL-Caltech/Arizona State University; no license text on the USGS page",
            "product_id": label.get("PRODUCT_ID"),
            "dataset_id": label.get("DATA_SET_ID"),
            "instrument": label.get("INSTRUMENT_ID"),
            "band": int(label["BAND_BIN_ORIGINAL_BAND"]),
            "wavelength_um": float(label["BAND_BIN_CENTER"]),
            "observation_start_utc": label.get("START_TIME"),
            "cube_sha256": hashlib.sha256(cube.read_bytes()).hexdigest(),
        },
        "native_pixel_m": pixel_m,
        "site_thermal_pixels": distinct,
        "output": {"width": meta["width"], "height": meta["height"], "cell_m": meta["cell_m"]},
        "bbox": meta["bbox"],
        "resampling": "nearest: each output pixel copies the THEMIS pixel containing its centre",
        "value": {
            "kind": "relative brightness, stretched 8-bit values (DN) of band 9 radiance",
            "not_calibrated_temperature": True,
            "site_dn_min": low,
            "site_dn_max": high,
            "nodata_dn": null_dn,
            "label_core_name": label.get("CORE_NAME"),
        },
        "colormap": {**COLORMAP, "low_is": f"DN {low}", "high_is": f"DN {high}"},
        "notes": [
            "One THEMIS observation, not a mosaic of many dates: a snapshot, not a time series.",
            "Native pixel is about 100 m; the site is only a few pixels wide.",
            "Values are stretched 8-bit numbers, not calibrated temperature or thermal inertia.",
        ],
    }
    text = json.dumps(info, indent=2, ensure_ascii=False) + "\n"
    (out_dir / "thermal.json").write_text(text, encoding="utf-8")
    (root / "backend/data" / site / "thermal.json").write_text(text, encoding="utf-8")
    return info


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("cube", type=Path, help="gale_crater_themis_dayir_isis.cub from USGS Astropedia")
    parser.add_argument("--output-root", type=Path, default=ROOT)
    parser.add_argument("--site", default=SITE, help="site folder under backend/data (default gale-bx)")
    args = parser.parse_args()
    info = build(args.cube, args.output_root, args.site)
    print(
        f"thermal.png {info['output']['width']}x{info['output']['height']}, "
        f"pixel {info['native_pixel_m']} m, {info['site_thermal_pixels']} THEMIS pixels, "
        f"DN {info['value']['site_dn_min']}..{info['value']['site_dn_max']}"
    )


if __name__ == "__main__":
    main()
