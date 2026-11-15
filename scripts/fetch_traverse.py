"""Download Curiosity's traverse and cut it down to the area around the ARES sites.

Source: the NASA/JPL MMGIS layer "MSL_traverse" (see ASSETS.md for the URL, credit and terms
status). The file is a GeoJSON FeatureCollection of the whole drive, about 1.3 MB with elevations.
The web app only needs the part near our sites, so this script

  1. downloads the file (or reads one given with --input),
  2. cuts it to a window: the area of interest (AOI) plus a margin,
  3. simplifies the line (Douglas-Peucker, a tolerance in metres), and drops the elevations,
  4. writes frontend/public/data/msl_traverse.json (format: docs/DATA_CONTRACT.md, section 10).

The AOI is the union of the bounding boxes in backend/data/<site>/meta.json, or --aoi. If the
traverse never enters the window, the part of the traverse nearest to the AOI is kept instead and
`intersects_aoi` says so: the file is still written, and the app shows the nearest part with its
distance. Nothing is invented: every vertex written is a vertex of the source, rounded to 1e-6 degrees.

    python -m scripts.fetch_traverse
    python -m scripts.fetch_traverse --input MSL_traverse.json --simplify-m 2
"""

import argparse
import hashlib
import json
import math
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json"
OUTPUT = ROOT / "frontend/public/data/msl_traverse.json"
MARS_RADIUS_M = 3396190.0  # the radius of docs/DATA_CONTRACT.md, section 4
SCHEMA = "ares.traverse/v1"
SIZE_LIMIT_BYTES = 150_000

Bbox = tuple[float, float, float, float]  # west, east, south, north
Line = list[tuple[float, float]]


def read_aoi(root: Path) -> Bbox:
    """Union of the site bounding boxes under backend/data."""
    boxes = []
    for meta in sorted((root / "backend/data").glob("*/meta.json")):
        b = json.loads(meta.read_text())["bbox"]
        boxes.append((b["lon_min"], b["lon_max"], b["lat_min"], b["lat_max"]))
    if not boxes:
        raise SystemExit("No backend/data/<site>/meta.json found; pass --aoi west east south north")
    return (min(b[0] for b in boxes), max(b[1] for b in boxes), min(b[2] for b in boxes), max(b[3] for b in boxes))


def grow(box: Bbox, margin_deg: float) -> Bbox:
    return (box[0] - margin_deg, box[1] + margin_deg, box[2] - margin_deg, box[3] + margin_deg)


def lines_of(collection: dict) -> list[Line]:
    """Every line of a FeatureCollection as (lon, lat) pairs; elevations are dropped."""
    if collection.get("type") != "FeatureCollection" or not isinstance(collection.get("features"), list):
        raise ValueError("The traverse file is not a GeoJSON FeatureCollection")
    out: list[Line] = []
    for feature in collection["features"]:
        geometry = (feature or {}).get("geometry") or {}
        kind, coords = geometry.get("type"), geometry.get("coordinates")
        parts = [coords] if kind == "LineString" else coords if kind == "MultiLineString" else []
        for part in parts:
            line = [(float(c[0]), float(c[1])) for c in part]
            if len(line) >= 2:
                out.append(line)
    if not out:
        raise ValueError("The traverse file has no lines")
    return out


def clip_segment(a, b, box: Bbox):
    """Liang-Barsky: the part of segment a-b inside the box, or None."""
    west, east, south, north = box
    dx, dy = b[0] - a[0], b[1] - a[1]
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, a[0] - west), (dx, east - a[0]), (-dy, a[1] - south), (dy, north - a[1])):
        if p == 0:
            if q < 0:
                return None
        else:
            r = q / p
            if p < 0:
                if r > t1:
                    return None
                t0 = max(t0, r)
            else:
                if r < t0:
                    return None
                t1 = min(t1, r)
    return (a[0] + t0 * dx, a[1] + t0 * dy), (a[0] + t1 * dx, a[1] + t1 * dy)


def clip_lines(lines: list[Line], box: Bbox) -> list[Line]:
    """The pieces of the lines inside the box. A line that leaves and comes back becomes two pieces."""
    out: list[Line] = []
    for line in lines:
        piece: Line = []
        for a, b in zip(line, line[1:]):
            seg = clip_segment(a, b, box)
            if seg is None:
                if len(piece) >= 2:
                    out.append(piece)
                piece = []
                continue
            start, end = seg
            if piece and piece[-1] != start:
                if len(piece) >= 2:
                    out.append(piece)
                piece = []
            if not piece:
                piece = [start]
            piece.append(end)
        if len(piece) >= 2:
            out.append(piece)
    return out


def project(lon: float, lat: float, lon0: float, lat0: float) -> tuple[float, float]:
    """Local equidistant metres, the projection of docs/DATA_CONTRACT.md, section 4."""
    return (
        MARS_RADIUS_M * math.radians(lon - lon0) * math.cos(math.radians(lat0)),
        MARS_RADIUS_M * math.radians(lat - lat0),
    )


def simplify(line: Line, tolerance_m: float, lon0: float, lat0: float) -> Line:
    """Douglas-Peucker with an explicit stack (the traverse has thousands of vertices in a row)."""
    if len(line) <= 2 or tolerance_m <= 0:
        return line
    xy = [project(lon, lat, lon0, lat0) for lon, lat in line]
    keep = [False] * len(line)
    keep[0] = keep[-1] = True
    stack = [(0, len(line) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = xy[i]
        bx, by = xy[j]
        length = math.hypot(bx - ax, by - ay)
        far, far_d = -1, tolerance_m
        for k in range(i + 1, j):
            px, py = xy[k]
            if length == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length
            if d > far_d:
                far, far_d = k, d
        if far != -1:
            keep[far] = True
            stack.extend([(i, far), (far, j)])
    return [p for p, k in zip(line, keep) if k]


def distance_to_box_m(lon: float, lat: float, box: Bbox) -> float:
    """Metres from a point to the box (0 inside)."""
    clon = min(max(lon, box[0]), box[1])
    clat = min(max(lat, box[2]), box[3])
    x, y = project(lon, lat, clon, clat)
    return math.hypot(x, y)


def nearest_vertex(lines: list[Line], box: Bbox) -> tuple[tuple[float, float], float]:
    best, best_d = None, math.inf
    for line in lines:
        for lon, lat in line:
            d = distance_to_box_m(lon, lat, box)
            if d < best_d:
                best, best_d = (lon, lat), d
    assert best is not None
    return best, best_d


def build(collection: dict, aoi: Bbox, margin_deg: float, simplify_m: float) -> dict:
    """The output document. Raises ValueError when the input has no lines."""
    lines = lines_of(collection)
    window = grow(aoi, margin_deg)
    pieces = clip_lines(lines, window)
    inside_aoi = clip_lines(lines, aoi)
    nearest, nearest_m = nearest_vertex(lines, aoi)
    if not pieces:
        # The traverse never comes near: keep the part around its nearest vertex, in a window of the same size.
        half_w, half_h = (window[1] - window[0]) / 2, (window[3] - window[2]) / 2
        around = (nearest[0] - half_w, nearest[0] + half_w, nearest[1] - half_h, nearest[1] + half_h)
        pieces = clip_lines(lines, around)
        window = around
    lon0, lat0 = (aoi[0] + aoi[1]) / 2, (aoi[2] + aoi[3]) / 2
    kept = [simplify(p, simplify_m, lon0, lat0) for p in pieces]
    coords = [[[round(lon, 6), round(lat, 6)] for lon, lat in p] for p in kept]
    return {
        "type": "FeatureCollection",
        "ares": {
            "schema": SCHEMA,
            "aoi_bbox": {"lon_min": aoi[0], "lon_max": aoi[1], "lat_min": aoi[2], "lat_max": aoi[3]},
            "clip_bbox": {"lon_min": window[0], "lon_max": window[1], "lat_min": window[2], "lat_max": window[3]},
            "margin_deg": margin_deg,
            "simplify_m": simplify_m,
            "intersects_aoi": bool(inside_aoi),
            "nearest_to_aoi": {"lon": round(nearest[0], 6), "lat": round(nearest[1], 6), "distance_m": round(nearest_m, 1)},
            "source_vertices": sum(len(line) for line in lines),
            "kept_vertices": sum(len(c) for c in coords),
            "elevations": "dropped",
        },
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "Curiosity traverse (clipped and simplified)"},
                "geometry": {"type": "MultiLineString", "coordinates": coords},
            }
        ],
    }


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "ares-planner-data-script/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=URL)
    parser.add_argument("--input", type=Path, help="read this file instead of downloading")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--aoi", type=float, nargs=4, metavar=("WEST", "EAST", "SOUTH", "NORTH"))
    parser.add_argument("--margin-deg", type=float, default=0.03, help="margin around the AOI, degrees (0.03 is about 1.8 km on Mars)")
    parser.add_argument("--simplify-m", type=float, default=3.0, help="Douglas-Peucker tolerance, metres")
    args = parser.parse_args(argv)

    raw = args.input.read_bytes() if args.input else download(args.url)
    aoi = tuple(args.aoi) if args.aoi else read_aoi(ROOT)
    try:
        document = build(json.loads(raw), aoi, args.margin_deg, args.simplify_m)
    except (ValueError, KeyError, TypeError) as e:
        print(f"Could not read the traverse: {e}", file=sys.stderr)
        return 1
    document["ares"] |= {
        "source": {
            "title": "MSL traverse, NASA/JPL Mars Trek MMGIS (Curiosity)",
            "url": args.url if not args.input else URL,
            "fetched_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
        }
    }
    text = json.dumps(document, separators=(",", ":")) + "\n"
    if len(text.encode()) > SIZE_LIMIT_BYTES:
        print(f"Output is {len(text.encode())} bytes, over the {SIZE_LIMIT_BYTES} limit: raise --simplify-m or lower --margin-deg", file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text)
    a = document["ares"]
    print(
        f"{args.output.relative_to(ROOT) if args.output.is_relative_to(ROOT) else args.output}: {len(text)} bytes, "
        f"{a['kept_vertices']} of {a['source_vertices']} vertices, intersects the AOI: {a['intersects_aoi']}, "
        f"nearest point {a['nearest_to_aoi']['distance_m']} m from the AOI"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
