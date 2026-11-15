"""Check our terrain against Curiosity's own measured drive.

The NASA/JPL MMGIS layer "MSL_traverse" is the rover's path as [lon, lat, z] vertices, made from the
rover's own position solutions. Where it crosses a site, its heights can be set against the elevation
of our grid (elevation.bin, from the HiRISE DTM). This script

  1. downloads the traverse, or reuses a cached copy (--cache), and reads the vertices inside the
     bbox of backend/data/<site>/meta.json (exact repeats, where two segments meet, count once),
  2. reads our elevation at each vertex with the projection of docs/DATA_CONTRACT.md, section 4
     (bilinear between cell centres; a vertex next to a no-data cell is left out and counted),
  3. compares the two heights: the raw difference (traverse z minus our elevation) and the difference
     after the constant offset between the two height references is removed,
  4. writes backend/data/<site>/validation.json (format: docs/DATA_CONTRACT.md, section 12).

Nothing in the file is typed in: every number comes from the run. With fewer than 30 vertices inside
the site, or heights that do not vary together, the file says so and carries no statistics: the
script does not force a result.

    python -m scripts.validate_traverse
    python -m scripts.validate_traverse --input MSL_traverse.json
"""

import argparse
import hashlib
import json
import math
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from scripts.fetch_traverse import URL, download

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = "ares.validation/v1"
MIN_POINTS = 30
#: Heights that move together have a correlation well above this; below it they are not comparable.
MIN_CORRELATION = 0.5
#: Below this spread (metres) of the traverse heights the correlation says nothing.
MIN_RELIEF_M = 1.0

OFFSET_NOTE = (
    "A constant offset between the two heights can exist because they are not the same surface or the "
    "same height reference. The MMGIS file does not state what its heights are measured from, and our "
    "elevation is the HiRISE DTM surface; possible causes are a different zero level (for example a "
    "geoid against the Mars 2000 sphere), a different tie to the global topography (a DTM carries a "
    "vertical registration uncertainty of its own), and a different measured point (the rover against "
    "the ground). This script does not tell these apart; it only removes the mean difference."
)

METHOD = (
    "Vertices of the MSL traverse inside the site bbox, exact repeats removed. Our elevation is read at "
    "each vertex with the local equidistant projection of docs/DATA_CONTRACT.md, section 4, bilinear "
    "between the centres of the four nearest cells; a vertex outside the grid or next to a no-data "
    "cell is skipped. difference = traverse z minus our elevation. The offset-corrected difference "
    "removes the mean of the raw difference. mean_m is the signed mean, std_m the population standard "
    "deviation, rmse_m the root of the mean square, max_abs_m the largest absolute value."
)


def read_vertices(collection: dict) -> list[tuple[float, float, float | None]]:
    """Every [lon, lat, z] vertex of the traverse, in file order. z is None when a vertex has only two coordinates."""
    if collection.get("type") != "FeatureCollection" or not isinstance(
        collection.get("features"), list
    ):
        raise ValueError("The traverse file is not a GeoJSON FeatureCollection")
    out = []
    for feature in collection["features"]:
        geometry = (feature or {}).get("geometry") or {}
        kind, coords = geometry.get("type"), geometry.get("coordinates")
        lines = [coords] if kind == "LineString" else coords if kind == "MultiLineString" else []
        for line in lines:
            for c in line:
                z = float(c[2]) if len(c) > 2 and c[2] is not None else None
                out.append((float(c[0]), float(c[1]), z))
    if not out:
        raise ValueError("The traverse file has no vertices")
    return out


def inside_bbox(vertices, bbox: dict):
    """The vertices inside the bbox, each (lon, lat) once. Returns (kept, repeats_removed)."""
    seen, kept = set(), []
    inside = 0
    for lon, lat, z in vertices:
        if bbox["lon_min"] <= lon <= bbox["lon_max"] and bbox["lat_min"] <= lat <= bbox["lat_max"]:
            inside += 1
            if (lon, lat) not in seen:
                seen.add((lon, lat))
                kept.append((lon, lat, z))
    return kept, inside - len(kept)


def sample_elevation(elevation: np.ndarray, meta: dict, lon: float, lat: float) -> float | None:
    """Our elevation at a point: bilinear between cell centres, or None outside the grid or next to a no-data cell."""
    radius = meta["mars_radius_m"]
    x = (
        radius
        * math.radians(lon - meta["center"]["lon"])
        * math.cos(math.radians(meta["center"]["lat"]))
    )
    y = radius * math.radians(lat - meta["center"]["lat"])
    col = (x - meta["x_min_m"]) / meta["cell_m"] - 0.5  # the centre of cell c is at c + 0.5
    row = (meta["y_max_m"] - y) / meta["cell_m"] - 0.5
    c0, r0 = math.floor(col), math.floor(row)
    if c0 < 0 or r0 < 0 or c0 + 1 >= meta["width"] or r0 + 1 >= meta["height"]:
        return None
    corners = elevation[r0 : r0 + 2, c0 : c0 + 2]
    if not np.isfinite(corners).all():
        return None
    fc, fr = col - c0, row - r0
    top = corners[0, 0] * (1 - fc) + corners[0, 1] * fc
    bottom = corners[1, 0] * (1 - fc) + corners[1, 1] * fc
    return float(top * (1 - fr) + bottom * fr)


def statistics(diff: np.ndarray) -> dict:
    return {
        "mean_m": float(diff.mean()),
        "std_m": float(diff.std()),
        "max_abs_m": float(np.abs(diff).max()),
        "rmse_m": float(math.sqrt(float((diff**2).mean()))),
    }


def compare(traverse_z: np.ndarray, ours: np.ndarray) -> dict:
    """The numbers of the comparison, or the reason there are none. All in metres."""
    n = len(traverse_z)
    if n < MIN_POINTS:
        return {
            "status": "insufficient_points",
            "reason": f"Only {n} traverse vertices fall inside the site; at least {MIN_POINTS} are needed for a comparison.",
        }
    relief = float(traverse_z.max() - traverse_z.min())
    if relief < MIN_RELIEF_M:
        return {
            "status": "not_comparable",
            "reason": f"The traverse heights vary by only {relief:.2f} m inside the site, so they cannot be compared with the terrain.",
        }
    if float(ours.std()) == 0.0:
        return {
            "status": "not_comparable",
            "reason": "Our elevation is constant under the traverse.",
        }
    correlation = float(np.corrcoef(traverse_z, ours)[0, 1])
    if correlation < MIN_CORRELATION:
        return {
            "status": "not_comparable",
            "reason": f"The traverse heights and our elevation do not vary together (correlation {correlation:.2f}, needs at least {MIN_CORRELATION}), so the two are not on comparable height references.",
            "correlation": correlation,
        }
    raw = traverse_z - ours
    offset = float(raw.mean())
    return {
        "status": "ok",
        "correlation": correlation,
        "raw": statistics(raw),
        "offset_corrected": {"offset_m": offset, **statistics(raw - offset)},
        "traverse_z_range_m": [float(traverse_z.min()), float(traverse_z.max())],
        "our_elevation_range_m": [float(ours.min()), float(ours.max())],
    }


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build(
    collection: dict,
    meta: dict,
    elevation: np.ndarray,
    source: dict,
    computed_utc: str,
    elevation_sha256: str,
) -> dict:
    """The validation.json document."""
    vertices = read_vertices(collection)
    kept, repeats = inside_bbox(vertices, meta["bbox"])
    with_z = [v for v in kept if v[2] is not None]
    pairs, skipped = [], 0
    for lon, lat, z in with_z:
        value = sample_elevation(elevation, meta, lon, lat)
        if value is None:
            skipped += 1
        else:
            pairs.append((z, value))
    z = np.array([p[0] for p in pairs], dtype=float)
    ours = np.array([p[1] for p in pairs], dtype=float)
    result = (
        compare(z, ours)
        if pairs
        else {
            "status": "insufficient_points",
            "reason": "No traverse vertex with a height falls on valid terrain inside the site.",
        }
    )
    return {
        "schema": SCHEMA,
        "site_id": meta["site_id"],
        "bbox": meta["bbox"],
        "method": METHOD,
        "n_points": len(pairs),
        "n_vertices_in_bbox": len(kept) + repeats,
        "n_repeats_removed": repeats,
        "n_without_height": len(kept) - len(with_z),
        "n_skipped_no_data": skipped,
        **result,
        "offset_note": OFFSET_NOTE,
        "source": source,
        "elevation_sha256": elevation_sha256,
        "computed_utc": computed_utc,
    }


def load_traverse(args) -> tuple[bytes, str]:
    """The traverse bytes and the time they were fetched, from --input, the cache or the network."""
    if args.input:
        stamp = datetime.fromtimestamp(args.input.stat().st_mtime, UTC)
        return args.input.read_bytes(), stamp.strftime("%Y-%m-%dT%H:%M:%SZ")
    cached, stamp_file = args.cache / "MSL_traverse.json", args.cache / "MSL_traverse.fetched"
    if cached.exists() and stamp_file.exists():
        return cached.read_bytes(), stamp_file.read_text().strip()
    raw = download(args.url)
    args.cache.mkdir(parents=True, exist_ok=True)
    fetched = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    cached.write_bytes(raw)
    stamp_file.write_text(fetched + "\n")
    return raw, fetched


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--site", default="gale-bx", help="folder under backend/data")
    parser.add_argument("--url", default=URL)
    parser.add_argument(
        "--input", type=Path, help="read this file instead of the cache or the network"
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=ROOT / "data/validation",
        help="where the download is kept (not committed)",
    )
    parser.add_argument("--data-root", type=Path, default=ROOT / "backend/data")
    args = parser.parse_args(argv)

    folder = args.data_root / args.site
    meta = json.loads((folder / "meta.json").read_text())
    elevation_bytes = (folder / "elevation.bin").read_bytes()
    elevation = (
        np.frombuffer(elevation_bytes, dtype="<f4")
        .reshape(meta["height"], meta["width"])
        .astype(float)
    )
    raw, fetched = load_traverse(args)
    try:
        document = build(
            json.loads(raw),
            meta,
            elevation,
            {
                "title": "MSL traverse, NASA/JPL Mars Trek MMGIS (Curiosity)",
                "url": args.url,
                "fetched_utc": fetched,
                "sha256": sha256(raw),
                "bytes": len(raw),
            },
            datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            sha256(elevation_bytes),
        )
    except (ValueError, KeyError, TypeError) as e:
        print(f"Could not read the traverse: {e}", file=sys.stderr)
        return 1
    output = folder / "validation.json"
    output.write_text(json.dumps(document, indent=2) + "\n")
    if document["status"] == "ok":
        r, c = document["raw"], document["offset_corrected"]
        print(
            f"{output}: {document['n_points']} points. Raw: mean {r['mean_m']:.2f} m, std {r['std_m']:.2f} m, "
            f"max |d| {r['max_abs_m']:.2f} m, RMSE {r['rmse_m']:.2f} m. "
            f"After removing the offset ({c['offset_m']:.2f} m): std {c['std_m']:.2f} m, "
            f"max |d| {c['max_abs_m']:.2f} m, RMSE {c['rmse_m']:.2f} m."
        )
    else:
        print(f"{output}: {document['status']}: {document['reason']}")
    print(OFFSET_NOTE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
