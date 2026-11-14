import json

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import Point, box

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


def test_missing_sol_is_an_error():
    with pytest.raises(ValueError, match="sol"):
        select_waypoints({"features": [{"properties": {}}]})


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


def test_offline_workflow_writes_evidence_and_preserves_region_work(tmp_path, monkeypatch):
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
    monkeypatch.setattr(
        r0_coverage, "PRODUCTS", {"A": "https://example.org/A", "B": "https://example.org/B"}
    )
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
    region = tmp_path / "gale_bx.json"
    region.write_text(json.dumps({"id": "GALE-BX", "habitat": {"name": "keep me"}}))
    result = r0_coverage.run(raw, output, region)
    assert result["selected_dtm"] == "B"
    config = json.loads(region.read_text())
    assert config["habitat"] == {"name": "keep me"}
    assert config["centre_lonlat_E"] == [137.4, -4.8]
    assert json.loads((output / "r0_result.json").read_text())["decision"] == "campaign-covered"
    assert (output / "r0_overlay.png").stat().st_size > 0
