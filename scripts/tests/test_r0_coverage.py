import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
import rasterio
from pyproj import CRS, Transformer
from rasterio.transform import from_origin
from shapely.geometry import Point, box, shape

from scripts import r0_coverage
from scripts.r0_coverage import (
    coverage,
    footprint,
    rover_crs_check,
    select_candidate,
    select_waypoints,
)


def waypoint(sol, x=0.5, y=0.5):
    return {
        "type": "Feature",
        "properties": {"sol": sol},
        "geometry": {"type": "Point", "coordinates": [x, y, -4000]},
    }


def test_sol_selection_is_inclusive_and_sorted():
    selected = select_waypoints({"features": [waypoint(s) for s in [4806, 4805, 4534, 4533]]})
    assert [f["properties"]["sol"] for f in selected] == [4534, 4805]


def test_empty_sol_selection_is_an_error():
    with pytest.raises(ValueError, match="No waypoints"):
        select_waypoints({"features": [waypoint(3)]})


def test_invalid_sols_outside_campaign_do_not_break_selection():
    selected = select_waypoints(
        {"features": [waypoint(None), waypoint("unknown"), waypoint(12.5), waypoint(4534)]}
    )
    assert [f["properties"]["sol"] for f in selected] == [4534]


def test_fractional_sol_in_campaign_is_rejected():
    with pytest.raises(ValueError, match="integer sol"):
        select_waypoints({"features": [waypoint(4534.5)]})


def test_footprint_preserves_holes_and_disconnected_pixels(tmp_path):
    path = tmp_path / "dtm.tif"
    data = np.full((5, 7), -9999, dtype="float32")
    data[:3, :3] = 0  # Zero elevation is valid.
    data[1, 1] = -9999  # NoData hole inside the bounding box.
    data[4, 6] = 12  # Disconnected island must survive polygonization.
    data[4, 5] = np.nan
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=7,
        height=5,
        count=1,
        dtype="float32",
        crs="+proj=eqc +R=3396190 +units=m",
        transform=from_origin(0, 5, 1, 1),
        nodata=-9999,
    ) as dst:
        dst.write(data, 1)
    geometry, metadata = footprint(path)
    assert geometry.area == 9
    assert geometry.covers(Point(0.5, 4.5))
    assert not geometry.covers(Point(1.5, 3.5))
    assert geometry.covers(Point(6.5, 0.5))
    assert not geometry.covers(Point(5.5, 0.5))
    assert metadata["radius_m"] == 3396190
    assert metadata["valid_pixels"] == 9


def test_coverage_checks_valid_geometry_including_boundary():
    geometry = box(0, 0, 3, 3).difference(box(1, 1, 2, 2))
    result = coverage(geometry, [waypoint(4534), waypoint(4535, 1.5, 1.5), waypoint(4805, 0, 1)])
    assert result["n_inside"] == 2
    assert result["sol_range_inside"] == [4534, 4805]
    assert result["outside_sols"] == [4535]


def test_partial_overlap_does_not_confirm_campaign():
    partial = {"product_id": "A", "n_inside": 64, "n_points": 65}
    complete = {"product_id": "B", "n_inside": 65, "n_points": 65}
    assert select_candidate([partial, complete]) == "B"
    assert select_candidate([partial]) is None


def test_polygonization_has_no_strip_seams(tmp_path):
    path = tmp_path / "strips.tif"
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=2,
        height=1025,
        count=1,
        dtype="float32",
        crs="+proj=eqc +R=3396190 +units=m",
        transform=from_origin(-3619.431, -279809.437, 1.0117467945795, 1.0117467945795),
        nodata=-9999,
    ) as dst:
        dst.write(np.ones((1025, 2), dtype="float32"), 1)
    geometry, _ = footprint(path)
    assert geometry.geom_type == "Polygon"
    assert len(geometry.interiors) == 0


def test_rover_crs_check_rejects_planetographic_latitude():
    feature = waypoint(4534, 137.4, -4.8)
    feature["properties"].update(
        {
            "easting": np.deg2rad(137.4) * 3396190,
            "northing": np.deg2rad(-4.8) * 3396190,
        }
    )
    assert rover_crs_check([feature])["max_residual_m"] < 1e-6
    feature["geometry"]["coordinates"][1] = -4.85
    with pytest.raises(ValueError, match="PLACES"):
        rover_crs_check([feature])


@pytest.mark.parametrize("handoff_directory", ["evidence", "handoffs"])
def test_offline_workflow_writes_evidence_and_preserves_region_work(tmp_path, handoff_directory):
    raw, output = tmp_path / "raw", tmp_path / "evidence"
    raw.mkdir()
    feature = waypoint(4534, 137.4, -4.8)
    feature["properties"].update(
        {
            "easting": np.deg2rad(137.4) * 3396190,
            "northing": np.deg2rad(-4.8) * 3396190,
        }
    )
    (raw / "MSL_waypoints.json").write_text(json.dumps({"features": [feature]}))
    for product in ["A", "B"]:
        data = np.ones((20, 20), dtype="float32")
        if product == "A":
            data[10, 10] = -9999
        with rasterio.open(
            raw / f"{product}.IMG",
            "w",
            driver="GTiff",
            width=20,
            height=20,
            count=1,
            dtype="float32",
            nodata=-9999,
            crs="+proj=eqc +lon_0=137.4 +R=3396190 +units=m",
            transform=from_origin(-10.5, feature["properties"]["northing"] + 10.5, 1, 1),
        ) as dst:
            dst.write(data, 1)
    entries = [
        {
            "role": "waypoints",
            "file": "MSL_waypoints.json",
            "snapshot": "raw/MSL_waypoints.json",
            "url": "https://example.org/waypoints",
        }
    ]
    entries.extend(
        {"role": "raster", "file": f"{p}.IMG", "product_id": p, "url": f"https://example.org/{p}"}
        for p in ["A", "B"]
    )
    for entry in entries:
        payload = (raw / entry["file"]).read_bytes()
        entry.update(sha256=hashlib.sha256(payload).hexdigest(), bytes=len(payload))
    manifest = tmp_path / "inputs.json"
    manifest.write_text(json.dumps({"inputs": entries}))
    region = tmp_path / "backend" / "data" / "gale_bx.json"
    region.parent.mkdir(parents=True)
    accepted = json.dumps({"id": "GALE-BX", "habitat": {"name": "keep me"}})
    region.write_text(accepted)
    handoff = tmp_path / handoff_directory / "gale_bx_handoff.json"
    planning_file = tmp_path / "final_points.geojson"
    planning_file.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"role": "target"},
                        "geometry": {"type": "Point", "coordinates": [137.40005, -4.8]},
                    },
                    {
                        "type": "Feature",
                        "properties": {"role": "habitat"},
                        "geometry": {"type": "Point", "coordinates": [137.4, -4.8]},
                    },
                ],
            }
        )
    )
    result = r0_coverage.run(
        raw, output.resolve(), handoff, manifest=manifest, planning_points=planning_file
    )
    assert result["selected_dtm"] == "B"
    assert region.read_text() == accepted
    config = json.loads(handoff.read_text())
    assert config["schema"] == "ares.r0-handoff/v1"
    evidence = config["coverage_evidence"]
    assert not Path(evidence).is_absolute()
    assert (handoff.parent / evidence).resolve() == (output / "r0_result.json").resolve()
    proposal = config["aoi_proposal"]
    assert proposal["planning_points_count"] == 2
    assert (output / "planning_points.geojson").read_bytes() == planning_file.read_bytes()
    assert proposal["crs_proj"].find("+no_defs=True") == -1
    crs = CRS.from_user_input(proposal["crs_proj"])
    parallel = next(
        p.value
        for p in crs.coordinate_operation.params
        if p.name == "Latitude of 1st standard parallel"
    )
    assert parallel == pytest.approx(proposal["centre_lonlat_E"][1])
    polygon = shape(proposal["aoi_geojson"])
    assert proposal["centre_lonlat_E"] == pytest.approx([polygon.centroid.x, polygon.centroid.y])
    assert polygon.covers(Point(proposal["centre_lonlat_E"]))
    lon, lat = proposal["centre_lonlat_E"]
    projected = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    start, end = projected.transform(lon, lat), projected.transform(lon + 0.01, lat)
    distance = crs.get_geod().inv(lon, lat, lon + 0.01, lat)[2]
    assert end[0] - start[0] == pytest.approx(distance, abs=0.001)
    assert json.loads((output / "r0_result.json").read_text())["decision"] == "campaign-covered"
    assert (output / "r0_overlay.png").stat().st_size > 0

    review = tmp_path / "review.json"
    review.write_text(
        json.dumps(
            {
                "schema": "ares.r0-planning-approval/v1",
                "reviewer": "synthetic-test-reviewer",
                "reviewed_on": "2026-11-14",
                "evidence": ["synthetic QA; test only"],
                "extent_sha256": proposal["extent_sha256"],
                "planning_points_sha256": proposal["planning_points_sha256"],
                "checks": {
                    "r6_targets_finalized": True,
                    "d9_habitat_finalized": True,
                    "terrain_qa_passed": True,
                },
            }
        )
    )
    approved = r0_coverage.run(
        raw,
        output,
        handoff,
        manifest=manifest,
        planning_points=planning_file,
        planning_approval=review,
    )
    assert approved["aoi_proposal"]["planning_ready"] is True
    assert (output / "planning_approval.json").read_bytes() == review.read_bytes()

    # A normal successful rerun must remove artifacts from the previous planning run.
    normal = r0_coverage.run(raw, output, handoff, manifest=manifest)
    assert normal["aoi_proposal"]["planning_points_count"] == 0
    assert not (output / "planning_points.geojson").exists()
    assert not (output / "planning_approval.json").exists()
    assert normal["aoi_proposal"]["planning_ready"] is False
    assert planning_file.exists()  # The caller's source file is preserved.

    # No covering candidate: publish the failed report but preserve the accepted handoff/config.
    with rasterio.open(raw / "B.IMG", "r+") as dst:
        data = dst.read(1)
        data[10, 10] = -9999
        dst.write(data, 1)
    payload = (raw / "B.IMG").read_bytes()
    entries[-1].update(sha256=hashlib.sha256(payload).hexdigest(), bytes=len(payload))
    manifest.write_text(json.dumps({"inputs": entries}))
    accepted_handoff = handoff.read_bytes()
    failed = r0_coverage.run(raw, output, handoff, manifest=manifest)
    assert failed["decision"] == "unresolved"
    assert handoff.read_bytes() == accepted_handoff
    assert region.read_text() == accepted


def test_plot_accepts_three_candidates(tmp_path):
    output = tmp_path / "three.png"
    r0_coverage.plot_overlay(
        {p: box(0, 0, 1, 1) for p in ["A", "B", "C"]}, [waypoint(4534)], [0.5, 0.5], output
    )
    assert output.stat().st_size > 0
