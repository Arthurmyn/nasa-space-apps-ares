"""R0 evidence handoff, deliberately distinct from issue #6's runtime Region Config."""

from __future__ import annotations

from pyproj import CRS, Transformer
from shapely.geometry import MultiPoint, Point, mapping
from shapely.ops import transform


def make_handoff(native_footprint, metadata: dict, waypoints: list[dict], evidence: str) -> dict:
    native_crs = CRS.from_wkt(metadata["crs_wkt"])
    to_native = Transformer.from_crs(native_crs.geodetic_crs, native_crs, always_xy=True)
    to_geo = Transformer.from_crs(native_crs, native_crs.geodetic_crs, always_xy=True)
    positions = MultiPoint(
        [to_native.transform(*feature["geometry"]["coordinates"][:2]) for feature in waypoints]
    )
    # Proposed planning extent, not a claim about slope, habitat or science targets.
    aoi = positions.envelope.buffer(100, cap_style="square").envelope.intersection(native_footprint)
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
            "status": "proposed; requires R1/Q6 terrain and habitat QA",
            "aoi_geojson": mapping(geographic_aoi),
            "centre_lonlat_E": [longitude, latitude],
            "crs_proj": working,
            "buffer": {
                "value": 100,
                "unit": "m",
                "source_tag": "R0-AOI-proposal-v1",
                "label": "assumption",
            },
            "center_method": "area centroid of campaign envelope + buffer clipped to valid DTM",
        },
        "native_dtm": {
            key: metadata[key] for key in ("crs_wkt", "crs_proj", "pixel_size_m", "radius_m")
        },
        "coverage_evidence": evidence,
    }
