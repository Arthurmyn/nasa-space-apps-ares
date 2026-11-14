"""Recreate and verify the pinned R0 waypoint snapshot against a NASA catalogue.

Offline: python -m scripts.r0_snapshot --source data/r0/raw/MSL_waypoints.json
Live:    python -m scripts.r0_snapshot --download
Use --output to save the reproduced snapshot. Pins are never silently updated.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import requests

from scripts.r0_coverage import COORDINATES, select_waypoints
from scripts.r0_sources import MANIFEST


def reproduce_snapshot(source: bytes, entry: dict) -> bytes:
    selected = select_waypoints(json.loads(source))
    collection = {
        "type": "FeatureCollection",
        "source_url": entry["url"],
        "coordinates": COORDINATES,
        "features": selected,
    }
    payload = (json.dumps(collection, allow_nan=False) + "\n").encode("utf-8")
    actual = hashlib.sha256(payload).hexdigest()
    if actual != entry["sha256"] or len(payload) != entry["bytes"]:
        raise ValueError(
            f"NASA campaign snapshot differs from the pin: expected {entry['sha256']}, "
            f"got {actual}. Inspect the differences and review new data/pins in Git; "
            "the accepted snapshot has not been changed."
        )
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path, default=Path("data/r0/raw/MSL_waypoints_verify.json")
    )
    parser.add_argument("--download", action="store_true", help="Fetch the current NASA catalogue")
    parser.add_argument(
        "--output", type=Path, help="Save recreated bytes only if they match the pin"
    )
    args = parser.parse_args()
    entry = next(
        item
        for item in json.loads(MANIFEST.read_text(encoding="utf-8"))["inputs"]
        if item["role"] == "waypoints"
    )
    if args.download:
        with requests.get(entry["url"], timeout=(15, 90)) as response:
            response.raise_for_status()
            source = response.content
        args.source.parent.mkdir(parents=True, exist_ok=True)
        args.source.write_bytes(source)
    else:
        source = args.source.read_bytes()
    snapshot = reproduce_snapshot(source, entry)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(snapshot)
    print(
        json.dumps(
            {
                "snapshot_matches_pin": True,
                "snapshot_sha256": entry["sha256"],
                "source_sha256": hashlib.sha256(source).hexdigest(),
                "source_matches_original_download": (
                    hashlib.sha256(source).hexdigest() == entry["provenance"]["source_sha256"]
                ),
                "sol_range": [4534, 4805],
                "n_positions": len(json.loads(snapshot)["features"]),
            }
        )
    )


if __name__ == "__main__":
    main()
