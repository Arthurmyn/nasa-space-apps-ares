"""Mars waypoint selection shared by GIS and standard-library-only snapshot tools."""

from __future__ import annotations

import math
from pathlib import Path

MANIFEST = Path(__file__).with_name("r0_inputs.json")
WAYPOINT_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
COORDINATES = "Mars planetocentric latitude; east longitude; degrees; NOT EPSG:4326"


def select_waypoints(collection: dict) -> list[dict]:
    """Keep available positions in the inclusive campaign interval, sorted stably."""
    selected = []
    for feature in collection["features"]:
        try:
            sol = float(feature.get("properties", {}).get("sol"))
        except (TypeError, ValueError):
            continue
        if not 4534 <= sol <= 4805:
            continue
        if not sol.is_integer():
            raise ValueError("Campaign waypoint must have an integer sol")
        geometry = feature.get("geometry", {})
        coords = geometry.get("coordinates", [])
        if (
            geometry.get("type") != "Point"
            or len(coords) < 2
            or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in coords[:2])
            or not 0 <= coords[0] <= 360
            or not -90 <= coords[1] <= 90
        ):
            raise ValueError(f"Invalid Mars waypoint at sol {sol}")
        selected.append(feature | {"properties": feature["properties"] | {"sol": int(sol)}})
    if not selected:
        raise ValueError("No waypoints in sols 4534–4805")
    return sorted(selected, key=lambda feature: feature["properties"]["sol"])
