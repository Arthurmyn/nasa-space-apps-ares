import pytest
from pyproj import CRS, Transformer
from shapely.geometry import Point, box, shape

from scripts.r0_handoff import make_handoff


def point(lon, lat):
    return {
        "type": "Feature",
        "properties": {},
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
    }


def inputs():
    crs = CRS.from_proj4("+proj=eqc +lon_0=137.4 +R=3396190 +units=m")
    convert = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    _, northing = convert.transform(137.4, -4.8)
    metadata = {
        "product_id": "TEST",
        "crs_wkt": crs.to_wkt(),
        "crs_proj": "+proj=eqc +lon_0=137.4 +R=3396190 +units=m",
        "pixel_size_m": [1.0117467945795, 1.0117467945795],
        "radius_m": 3396190,
        "source_sha256": "a" * 64,
    }
    return box(-2000, northing - 2000, 2000, northing + 2000), metadata, [point(137.4, -4.8)]


def test_aoi_is_explicitly_preliminary_until_r6_d9():
    native, metadata, rover = inputs()
    proposal = make_handoff(native, metadata, rover, "r0_result.json")["aoi_proposal"]
    assert proposal["planning_ready"] is False
    assert proposal["required_extent_inputs"] == ["R6 science targets", "D9 habitat"]
    assert proposal["planning_points_count"] == 0


def test_finalized_planning_points_expand_aoi_beyond_rover_track():
    native, metadata, rover = inputs()
    target = point(137.41, -4.8)
    initial = make_handoff(native, metadata, rover, "r0_result.json")["aoi_proposal"]
    expanded = make_handoff(
        native, metadata, rover, "r0_result.json", planning_points=[target], buffer_m=250
    )["aoi_proposal"]
    target_geometry = Point(137.41, -4.8)
    assert not shape(initial["aoi_geojson"]).covers(target_geometry)
    assert shape(expanded["aoi_geojson"]).covers(target_geometry)
    assert expanded["planning_points_count"] == 1
    assert expanded["buffer"]["value"] == 250
    assert expanded["planning_ready"] is False  # Input inclusion does not certify terrain.


def test_planning_point_outside_valid_dtm_is_not_silently_clipped():
    native, metadata, rover = inputs()
    with pytest.raises(ValueError, match="outside valid DTM"):
        make_handoff(native, metadata, rover, "r0_result.json", planning_points=[point(138, -4.8)])


@pytest.mark.parametrize("buffer_m", [0, -1, float("nan"), float("inf")])
def test_invalid_aoi_buffer_is_rejected(buffer_m):
    native, metadata, rover = inputs()
    with pytest.raises(ValueError, match="buffer"):
        make_handoff(native, metadata, rover, "r0_result.json", buffer_m=buffer_m)


def test_planning_readiness_requires_review_bound_to_points_and_extent():
    native, metadata, rover = inputs()
    points = [point(137.4, -4.8), point(137.41, -4.8)]
    for feature, role in zip(points, ["habitat", "target"], strict=True):
        feature["properties"]["role"] = role
    digest = "1" * 64
    proposed = make_handoff(
        native,
        metadata,
        rover,
        "r0_result.json",
        planning_points=points,
        planning_points_sha256=digest,
    )
    approval = {
        "schema": "ares.r0-planning-approval/v1",
        "reviewer": "test-reviewer",
        "reviewed_on": "2026-11-14",
        "evidence": ["test-only terrain QA record"],
        "extent_sha256": proposed["aoi_proposal"]["extent_sha256"],
        "planning_points_sha256": digest,
        "checks": {
            "r6_targets_finalized": True,
            "d9_habitat_finalized": True,
            "terrain_qa_passed": True,
        },
    }
    approved = make_handoff(
        native,
        metadata,
        rover,
        "r0_result.json",
        planning_points=points,
        planning_points_sha256=digest,
        planning_approval=approval,
    )
    assert approved["aoi_proposal"]["planning_ready"] is True
    assert approved["aoi_proposal"]["planning_approval"]["reviewer"] == "test-reviewer"
    with pytest.raises(ValueError, match="approval"):
        make_handoff(
            native,
            metadata,
            rover,
            "r0_result.json",
            planning_points=points,
            planning_points_sha256=digest,
            planning_approval=approval,
            buffer_m=250,
        )
    with pytest.raises(ValueError, match="approval"):
        make_handoff(
            native,
            metadata | {"source_sha256": "b" * 64},
            rover,
            "r0_result.json",
            planning_points=points,
            planning_points_sha256=digest,
            planning_approval=approval,
        )
    with pytest.raises(ValueError, match="approval"):
        make_handoff(
            native,
            metadata,
            rover,
            "r0_result.json",
            planning_points=points,
            planning_points_sha256="2" * 64,
            planning_approval=approval,
        )
    approval["checks"]["terrain_qa_passed"] = False
    with pytest.raises(ValueError, match="approval"):
        make_handoff(
            native,
            metadata,
            rover,
            "r0_result.json",
            planning_points=points,
            planning_points_sha256=digest,
            planning_approval=approval,
        )
