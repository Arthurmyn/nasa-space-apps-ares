"""The geologic unit at a point, from a site's geology.json (docs/DATA_CONTRACT.md, section 11).

The file is made by scripts/make_geology.py from the USGS Geologic Map of Mars (SIM 3292),
clipped to the site bbox. It is read once when the site loads. Point-in-polygon is plain ray
casting, so the deployed backend needs no geometry library.
"""

import json
import logging
import math
from pathlib import Path

SCHEMA = "ares.geology/v1"
logger = logging.getLogger(__name__)


def read_geology(directory: Path, meta: dict) -> dict | None:
    """The parsed geology.json, or None when it is missing or does not belong to this site.

    A file that is malformed, for another site or for another bbox is ignored with a log line, so
    the endpoint says "no data" instead of answering from the wrong place.
    """
    path = directory / "geology.json"
    if not path.exists():
        return None
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
        info = doc["ares"]
        if (
            doc["type"] != "FeatureCollection"
            or info["schema"] != SCHEMA
            or info["site_id"] != meta["site_id"]
            or info["bbox"] != meta["bbox"]
            or not isinstance(info["source"]["url"], str)
        ):
            raise ValueError("does not match this site")
        for feature in doc["features"]:
            props = feature["properties"]
            if not (isinstance(props["unit"], str) and isinstance(props["name"], str)):
                raise ValueError("a feature has no unit code or name")
            _polygons(feature["geometry"])
        return doc
    except (OSError, ValueError, KeyError, TypeError):
        logger.exception("Ignoring geology file %s", path)
        return None


def _polygons(geometry: dict) -> list[list[list[tuple[float, float]]]]:
    """The polygons of a Polygon or MultiPolygon as lists of rings (the first is the outline)."""
    if geometry["type"] == "Polygon":
        raw = [geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        raw = geometry["coordinates"]
    else:
        raise ValueError("geometry must be a Polygon or MultiPolygon")
    polygons = []
    for polygon in raw:
        rings = [[(float(x), float(y)) for x, y in ring] for ring in polygon]
        if not rings or any(
            len(r) < 4 or not all(map(math.isfinite, (*r[0], *r[-1]))) for r in rings
        ):
            raise ValueError("a polygon ring has fewer than 4 points")
        polygons.append(rings)
    return polygons


def _in_ring(ring, x: float, y: float) -> bool:
    inside = False
    for (x0, y0), (x1, y1) in zip(ring, ring[1:], strict=False):
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            inside = not inside
    return inside


def _in_polygon(rings, x: float, y: float) -> bool:
    return _in_ring(rings[0], x, y) and not any(_in_ring(hole, x, y) for hole in rings[1:])


def unit_at(doc: dict, lon: float, lat: float) -> dict | None:
    """The unit whose polygon holds the point, or None."""
    for feature in doc["features"]:
        if any(_in_polygon(rings, lon, lat) for rings in _polygons(feature["geometry"])):
            props = feature["properties"]
            return {"unit": props["unit"], "name": props["name"]}
    return None
