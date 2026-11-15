"""Enlarge the AOI of a site around the same centre, as far as the valid DTM footprint allows.

The AOI of docs/research/r0/gale_bx_handoff.json is a rectangle around Curiosity's positions. To grow it
without moving the stops, the centre stays where it is and the rectangle gets larger, but never past the
valid data of the DTM:

  1. the valid-pixel footprint is read from docs/research/r0/<product>_footprint.geojson, the output of
     scripts/r0_coverage.py (--dtm recomputes it from the DTM itself and checks the two agree);
  2. the requested rectangle (--width-m x --height-m, north up, in the local equirectangular Mars
     projection of docs/DATA_CONTRACT.md) must lie inside the footprint with --margin-m to spare, so the
     slope window and the bilinear reads at the edge still have data;
  3. if it does not, the script finds the largest rectangle of the same width to height ratio that does,
     and says which side of the footprint is in the way. Nothing is guessed: the size written is the
     size that was tested.

The handoff is rewritten in place (or to --output): `aoi_geojson` and `size_m` change, and an `enlarged`
record keeps the previous rectangle and the request. The centre and the projection do not change.

    python -m scripts.enlarge_aoi --width-m 2500 --height-m 3500
"""

import argparse
import json
import math
import warnings
from pathlib import Path

from pyproj import CRS, Transformer
from shapely.geometry import LineString, Point, box, mapping, shape
from shapely.ops import transform as transform_geometry

warnings.filterwarnings("ignore", message="The .shapely.ops.transform", category=DeprecationWarning)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HANDOFF = ROOT / "docs/research/r0/gale_bx_handoff.json"


def to_local(handoff: dict, footprint_geometry: dict):
    """The footprint in the handoff's local metric frame, with the transformers of that frame."""
    proposal = handoff["aoi_proposal"]
    crs = CRS.from_user_input(proposal["crs_proj"])
    forward = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    back = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
    return transform_geometry(forward.transform, shape(footprint_geometry)), back


def centred(width_m: float, height_m: float):
    return box(-width_m / 2, -height_m / 2, width_m / 2, height_m / 2)


def fits(footprint_m, width_m: float, height_m: float, margin_m: float) -> bool:
    return footprint_m.contains(centred(width_m + 2 * margin_m, height_m + 2 * margin_m))


def edge_distances_m(footprint_m) -> dict[str, float]:
    """Distance from the centre to the footprint boundary along the four compass directions."""
    outline = footprint_m.exterior if footprint_m.geom_type == "Polygon" else footprint_m.boundary
    out = {}
    for name, (dx, dy) in {"west": (-1, 0), "east": (1, 0), "north": (0, 1), "south": (0, -1)}.items():
        hit = LineString([(0, 0), (dx * 1e6, dy * 1e6)]).intersection(outline)
        out[name] = round(Point(0, 0).distance(hit), 1) if not hit.is_empty else math.inf
    return out


def largest_same_ratio(footprint_m, width_m: float, height_m: float, margin_m: float, step_m: float):
    """The largest (width, height) with the ratio of the request that fits, both rounded down to a multiple of step_m."""
    if fits(footprint_m, width_m, height_m, margin_m):
        scale = 1.0
    else:
        low, high = 0.0, 1.0
        for _ in range(60):
            middle = (low + high) / 2
            if fits(footprint_m, width_m * middle, height_m * middle, margin_m):
                low = middle
            else:
                high = middle
        scale = low
    w = math.floor(width_m * scale / step_m) * step_m
    h = math.floor(height_m * scale / step_m) * step_m
    if w < step_m or h < step_m or not fits(footprint_m, w, h, margin_m):
        raise ValueError("no rectangle around this centre fits inside the valid footprint")
    return w, h


def enlarge(handoff: dict, feature: dict, width_m: float, height_m: float, margin_m: float, step_m: float) -> tuple[dict, dict]:
    """The new handoff and a report of what was asked, what fits and what is in the way."""
    footprint_m, back = to_local(handoff, feature["geometry"])
    if not footprint_m.contains(Point(0, 0)):
        raise ValueError("the centre of the handoff is outside the valid footprint")
    w, h = largest_same_ratio(footprint_m, width_m, height_m, margin_m, step_m)
    proposal = handoff["aoi_proposal"]
    previous = proposal["aoi_geojson"]
    new = json.loads(json.dumps(handoff))
    new_proposal = new["aoi_proposal"]
    new_proposal["aoi_geojson"] = mapping(transform_geometry(back.transform, centred(w, h)))
    new_proposal["size_m"] = [w, h]
    new_proposal["enlarged"] = {
        "requested_m": [width_m, height_m],
        "written_m": [w, h],
        "request_fits": (w, h) == (width_m, height_m),
        "margin_to_footprint_m": margin_m,
        "ratio_kept": True,
        "previous_aoi_geojson": previous,
        "previous_extent_sha256": proposal.get("extent_sha256"),
        "footprint": f"docs/research/r0/{handoff['dtm_product_id']}_footprint.geojson",
        "method": "same centre; the largest rectangle of the requested width to height ratio that lies inside the valid footprint with the margin to spare",
    }
    new_proposal.pop("extent_sha256", None)  # it described the old rectangle
    report = {
        "requested_m": [width_m, height_m],
        "written_m": [w, h],
        "request_fits": (w, h) == (width_m, height_m),
        "centre_to_footprint_edge_m": edge_distances_m(footprint_m),
        "footprint_area_km2": round(footprint_m.area / 1e6, 2),
    }
    return new, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--handoff", type=Path, default=DEFAULT_HANDOFF)
    parser.add_argument("--footprint", type=Path, help="default: docs/research/r0/<product>_footprint.geojson")
    parser.add_argument("--dtm", type=Path, help="recompute the footprint from this DTM with scripts.r0_coverage and check it agrees")
    parser.add_argument("--width-m", type=float, required=True)
    parser.add_argument("--height-m", type=float, required=True)
    parser.add_argument("--margin-m", type=float, default=20.0)
    parser.add_argument("--step-m", type=float, default=4.0, help="round the size down to a multiple of this (the cell size)")
    parser.add_argument("--output", type=Path, help="default: rewrite --handoff")
    args = parser.parse_args(argv)
    if not all(math.isfinite(v) and v > 0 for v in (args.width_m, args.height_m, args.step_m)) or args.margin_m < 0:
        parser.error("sizes must be finite and positive, the margin not negative")

    handoff = json.loads(args.handoff.read_text(encoding="utf-8"))
    footprint_path = args.footprint or ROOT / f"docs/research/r0/{handoff['dtm_product_id']}_footprint.geojson"
    feature = json.loads(footprint_path.read_text(encoding="utf-8"))
    if args.dtm:
        from scripts.r0_coverage import footprint as read_footprint

        native, metadata = read_footprint(args.dtm)
        native_crs = CRS.from_wkt(metadata["crs_wkt"])
        to_geo = Transformer.from_crs(native_crs, native_crs.geodetic_crs, always_xy=True)
        recomputed_m, _ = to_local(handoff, mapping(transform_geometry(to_geo.transform, native)))
        committed_m, _ = to_local(handoff, feature["geometry"])
        difference = recomputed_m.symmetric_difference(committed_m).area
        print(f"footprint recomputed from the DTM vs {footprint_path.name}: differ by {difference:.1f} m2 of {committed_m.area:.0f} m2")
        if difference > 1e-4 * committed_m.area:
            print("Error: the committed footprint does not match the DTM; run scripts.r0_coverage first")
            return 1
    try:
        new, report = enlarge(handoff, feature, args.width_m, args.height_m, args.margin_m, args.step_m)
    except ValueError as e:
        print(f"Error: {e}")
        return 1
    (args.output or args.handoff).write_text(json.dumps(new, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
