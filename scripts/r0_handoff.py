"""R0 evidence handoff, deliberately distinct from issue #6's runtime Region Config."""

from __future__ import annotations

import math

from pyproj import CRS, Transformer
from shapely.geometry import MultiPoint, Point, mapping
from shapely.ops import transform


def make_handoff(
    native_footprint,
    metadata: dict,
    waypoints: list[dict],
    evidence: str,
    *,
    planning_points: list[dict] | None = None,
    buffer_m: float = 100,
) -> dict:
    if not math.isfinite(buffer_m) or buffer_m <= 0:
        raise ValueError("AOI buffer must be a positive finite distance in meters")
    planning_points = planning_points or []
    native_crs = CRS.from_wkt(metadata["crs_wkt"])
    to_native = Transformer.from_crs(native_crs.geodetic_crs, native_crs, always_xy=True)
    to_geo = Transformer.from_crs(native_crs, native_crs.geodetic_crs, always_xy=True)
    coordinates = []
    for feature in [*waypoints, *planning_points]:
        geometry = feature.get("geometry", {})
        point = geometry.get("coordinates", [])
        if (
            geometry.get("type") != "Point"
            or len(point) < 2
            or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in point[:2])
            or not 0 <= point[0] <= 360
            or not -90 <= point[1] <= 90
        ):
            raise ValueError("Planning points must be finite Mars lon/lat Point features")
        coordinates.append(to_native.transform(*point[:2]))
    positions = MultiPoint(coordinates)
    if not native_footprint.covers(positions):
        raise ValueError(
            "Campaign or planning point outside valid DTM; revise point or DTM selection"
        )
    # Proposed planning extent, not a claim about slope, habitat or science targets.
    aoi = positions.envelope.buffer(buffer_m, cap_style="square").envelope.intersection(
        native_footprint
    )
    center = aoi.centroid
    if aoi.is_empty or not aoi.covers(center) or not aoi.covers(positions):
        raise ValueError("Campaign AOI needs an explicit polygon; automatic proposal is unsuitable")
    longitude, latitude = to_geo.transform(center.x, center.y)
    radius = metadata["radius_m"]
    working = (
        f"+proj=eqc +lat_ts={latitude:.12f} +lat_0={latitude:.12f} "
        f"+lon_0={longitude:.12f} +R={radius:.12g} +units=m +no_defs"
    )
    geographic_aoi = transform(to_geo.transform, aoi)
    if not geographic_aoi.covers(Point(longitude, latitude)):
        raise ValueError("AOI center outside proposed footprint")
    return {
        "schema": "ares.r0-handoff/v1",
        "region_id": "GALE-BX",
        "decision": "campaign-covered",
        "dtm_product_id": metadata["product_id"],
        "aoi_proposal": {
            "status": "preliminary; recompute and approve after R6/D9 and R1/Q6 terrain QA",
            "planning_ready": False,
            "required_extent_inputs": ["R6 science targets", "D9 habitat"],
            "planning_points_count": len(planning_points),
            "extent_policy": (
                "Recompute with all finalized targets and habitat before enabling /plan"
            ),
            "aoi_geojson": mapping(geographic_aoi),
            "centre_lonlat_E": [longitude, latitude],
            "crs_proj": working,
            "buffer": {
                "value": buffer_m,
                "unit": "m",
                "source_tag": "R0-AOI-proposal-v1",
                "label": "assumption",
            },
            "center_method": (
                "centroid of campaign + planning-point envelope and buffer, clipped to DTM"
            ),
        },
        "native_dtm": {
            key: metadata[key] for key in ("crs_wkt", "crs_proj", "pixel_size_m", "radius_m")
        },
        "coverage_evidence": evidence,
    }
