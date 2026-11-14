"""Write the AOI handoff of a site that has a HiRISE DTM but no rover positions to anchor it.

The Gale site (docs/research/r0/gale_bx_handoff.json) takes its AOI from Curiosity positions. A site
such as the one on DTM DTEEC_001488_1750_001752_1750_U02 has none inside its valid footprint, so the
AOI is a fixed-size rectangle placed where the valid footprint is deepest:

  1. take the largest polygon of the valid-pixel footprint (docs/research/r0/*_footprint.geojson);
  2. its centre is the point farthest from every edge (centre of the maximum inscribed circle);
  3. the AOI is a north-up rectangle of --width-m x --height-m around that centre, in the local
     equirectangular Mars projection of docs/DATA_CONTRACT.md (sphere 3396190 m);
  4. the script refuses to write if the rectangle is not fully inside the valid footprint.

The output has the shape scripts/make_slope_grid.py reads, plus site_id and site_name.

    python -m scripts.make_site_handoff --footprint docs/research/r0/DTEEC_001488_..._footprint.geojson \\
        --site-id gale-bradbury --site-name "..." --output docs/research/r0/gale_bradbury_handoff.json
"""

import argparse
import json
import warnings
import math
from pathlib import Path

from pyproj import CRS, Transformer
from shapely.geometry import Polygon, box, mapping, shape
from shapely.ops import transform as transform_geometry

RADIUS = 3396190

warnings.filterwarnings("ignore", category=DeprecationWarning, module="shapely")


def largest_polygon(footprint) -> Polygon:
    if footprint.geom_type == "Polygon":
        return footprint
    return max(footprint.geoms, key=lambda g: g.area)


def local_crs(lon0: float, lat0: float) -> CRS:
    return CRS.from_proj4(f"+proj=eqc +lat_ts={lat0} +lat_0={lat0} +lon_0={lon0} +R={RADIUS} +units=m +no_defs")


def build_handoff(feature: dict, site_id: str, site_name: str, width_m: float, height_m: float) -> dict:
    footprint = shape(feature["geometry"])
    # Work in a rough local metric frame to find the deepest point, then refine in the final CRS.
    rough_lon, rough_lat = footprint.representative_point().coords[0]
    rough = local_crs(rough_lon, rough_lat)
    to_m = Transformer.from_crs(rough.geodetic_crs, rough, always_xy=True)
    to_deg = Transformer.from_crs(rough, rough.geodetic_crs, always_xy=True)
    metric = transform_geometry(to_m.transform, largest_polygon(footprint))
    # shapely.maximum_inscribed_circle needs a tolerance; 1 m is far below the AOI size.
    from shapely import maximum_inscribed_circle

    line = maximum_inscribed_circle(metric, tolerance=1.0)
    cx, cy = line.coords[0]
    lon0, lat0 = to_deg.transform(cx, cy)

    crs = local_crs(lon0, lat0)
    forward = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    back = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
    rectangle_m = box(-width_m / 2, -height_m / 2, width_m / 2, height_m / 2)
    aoi = transform_geometry(back.transform, rectangle_m)
    if not footprint.contains(aoi):
        raise ValueError("the AOI rectangle is not fully inside the valid footprint; use a smaller size")
    centre_m = forward.transform(lon0, lat0)
    assert abs(centre_m[0]) < 1e-6 and abs(centre_m[1]) < 1e-6
    props = feature.get("properties", {})
    return {
        "schema": "ares.r0-handoff/v1",
        "site_id": site_id,
        "site_name": site_name,
        "region_id": site_id.upper(),
        "decision": "dtm-footprint-only",
        "dtm_product_id": props["product_id"],
        "aoi_proposal": {
            "status": "preliminary; no rover positions inside this DTM, the AOI only sits where the valid data is deepest",
            "planning_ready": False,
            "aoi_geojson": mapping(aoi),
            "centre_lonlat_E": [lon0, lat0],
            "crs_proj": f"+proj=eqc +lat_ts={lat0:.12f} +lat_0={lat0:.12f} +lon_0={lon0:.12f} +R={RADIUS} +units=m +no_defs",
            "size_m": [width_m, height_m],
            "center_method": "centre of the maximum inscribed circle of the largest valid-footprint polygon",
            "source_footprint": f"docs/research/r0/{props['product_id']}_footprint.geojson",
        },
    }


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("--footprint", type=Path, required=True)
    p.add_argument("--site-id", required=True)
    p.add_argument("--site-name", required=True)
    p.add_argument("--width-m", type=float, default=632.0)
    p.add_argument("--height-m", type=float, default=860.0)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    if not (math.isfinite(args.width_m) and math.isfinite(args.height_m)) or min(args.width_m, args.height_m) < 100:
        p.error("size must be finite and at least 100 m")
    feature = json.loads(args.footprint.read_text(encoding="utf-8"))
    handoff = build_handoff(feature, args.site_id, args.site_name, args.width_m, args.height_m)
    args.output.write_text(json.dumps(handoff, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    lon, lat = handoff["aoi_proposal"]["centre_lonlat_E"]
    print(f"wrote {args.output}: centre {lon:.6f} E, {lat:.6f} N, {args.width_m:g} x {args.height_m:g} m")


if __name__ == "__main__":
    main()
