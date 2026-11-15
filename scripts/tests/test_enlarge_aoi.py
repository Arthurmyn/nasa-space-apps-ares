import json
import math

import pytest
from pyproj import CRS, Transformer
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import transform

from scripts import enlarge_aoi as ea

LON0, LAT0, R = 137.0, -4.8, 3396190
CRS_LOCAL = CRS.from_proj4(f"+proj=eqc +lat_ts={LAT0} +lat_0={LAT0} +lon_0={LON0} +R={R} +units=m +no_defs")
BACK = Transformer.from_crs(CRS_LOCAL, CRS_LOCAL.geodetic_crs, always_xy=True)
FORWARD = Transformer.from_crs(CRS_LOCAL.geodetic_crs, CRS_LOCAL, always_xy=True)


def lonlat_polygon(local):
    return mapping(transform(BACK.transform, local))


def handoff(width=632.0, height=860.0):
    return {
        "dtm_product_id": "DTEEC_TEST",
        "aoi_proposal": {
            "aoi_geojson": lonlat_polygon(box(-width / 2, -height / 2, width / 2, height / 2)),
            "centre_lonlat_E": [LON0, LAT0],
            "crs_proj": CRS_LOCAL.to_proj4(),
            "extent_sha256": "old",
            "buffer": {"value": 0},
        },
    }


def feature(local):
    return {"type": "Feature", "properties": {"product_id": "DTEEC_TEST"}, "geometry": lonlat_polygon(local)}


WIDE = box(-5000, -8000, 5000, 8000)  # plenty of room all round
NARROW_WEST = box(-1000, -8000, 5000, 8000)  # the west edge is 1000 m from the centre


def local_aoi(new):
    crs = CRS.from_user_input(new["aoi_proposal"]["crs_proj"])
    forward = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    return transform(forward.transform, shape(new["aoi_proposal"]["aoi_geojson"]))


def test_a_request_that_fits_is_written_as_asked():
    new, report = ea.enlarge(handoff(), feature(WIDE), 2500, 3500, margin_m=20, step_m=4)
    assert report["request_fits"] is True and report["written_m"] == [2500, 3500]
    aoi = local_aoi(new)
    assert aoi.bounds == pytest.approx((-1250, -1750, 1250, 1750), abs=1e-3)
    assert new["aoi_proposal"]["size_m"] == [2500, 3500]


def test_the_centre_and_the_projection_do_not_move():
    old = handoff()
    new, _ = ea.enlarge(old, feature(WIDE), 2500, 3500, margin_m=20, step_m=4)
    assert new["aoi_proposal"]["centre_lonlat_E"] == old["aoi_proposal"]["centre_lonlat_E"]
    assert new["aoi_proposal"]["crs_proj"] == old["aoi_proposal"]["crs_proj"]
    assert local_aoi(new).centroid.distance(Point(0, 0)) < 1e-6


def test_a_request_that_does_not_fit_gets_the_largest_rectangle_of_the_same_ratio():
    new, report = ea.enlarge(handoff(), feature(NARROW_WEST), 2500, 3500, margin_m=20, step_m=4)
    w, h = report["written_m"]
    assert report["request_fits"] is False
    # 980 m from the centre to the west edge once the margin is kept: the width is at most 1960 m.
    assert 1950 <= w <= 1960 and w / h == pytest.approx(2500 / 3500, abs=0.01)
    assert w % 4 == 0 and h % 4 == 0
    # one more step in size would not fit
    assert not ea.fits(NARROW_WEST, w + 12, (w + 12) * 3500 / 2500, 20)
    assert NARROW_WEST.contains(local_aoi(new).buffer(20 - 1e-6, cap_style="square"))


def test_the_margin_is_kept_to_the_footprint_edge():
    new, _ = ea.enlarge(handoff(), feature(NARROW_WEST), 2500, 3500, margin_m=100, step_m=4)
    aoi = local_aoi(new)
    assert aoi.bounds[0] >= -1000 + 100 - 1e-6


def test_the_report_says_which_side_is_in_the_way():
    _, report = ea.enlarge(handoff(), feature(NARROW_WEST), 2500, 3500, margin_m=20, step_m=4)
    edges = report["centre_to_footprint_edge_m"]
    assert edges["west"] == pytest.approx(1000, abs=1)
    assert edges["west"] < edges["east"] < edges["north"] + 1e9
    assert min(edges, key=edges.get) == "west"


def test_the_record_keeps_the_old_rectangle_and_drops_the_stale_hash():
    old = handoff()
    new, _ = ea.enlarge(old, feature(WIDE), 2500, 3500, margin_m=20, step_m=4)
    record = new["aoi_proposal"]["enlarged"]
    assert record["previous_aoi_geojson"] == old["aoi_proposal"]["aoi_geojson"]
    assert record["previous_extent_sha256"] == "old" and "extent_sha256" not in new["aoi_proposal"]
    assert record["requested_m"] == [2500, 3500] and record["written_m"] == [2500, 3500]
    assert old["aoi_proposal"]["extent_sha256"] == "old", "the input is not changed"


def test_a_centre_outside_the_footprint_is_refused():
    with pytest.raises(ValueError, match="centre"):
        ea.enlarge(handoff(), feature(box(500, 500, 3000, 3000)), 2500, 3500, margin_m=20, step_m=4)


def test_a_footprint_too_small_for_any_rectangle_is_refused():
    with pytest.raises(ValueError, match="no rectangle"):
        ea.enlarge(handoff(), feature(box(-10, -10, 10, 10)), 2500, 3500, margin_m=20, step_m=4)


def test_main_rewrites_the_handoff_and_reports(tmp_path, capsys):
    path = tmp_path / "handoff.json"
    path.write_text(json.dumps(handoff()))
    footprint = tmp_path / "fp.geojson"
    footprint.write_text(json.dumps(feature(NARROW_WEST)))
    assert ea.main(["--handoff", str(path), "--footprint", str(footprint), "--width-m", "2500", "--height-m", "3500"]) == 0
    written = json.loads(path.read_text())
    assert written["aoi_proposal"]["size_m"][0] <= 2000
    report = json.loads(capsys.readouterr().out)
    assert report["request_fits"] is False and report["requested_m"] == [2500, 3500]
    assert min(report["centre_to_footprint_edge_m"], key=report["centre_to_footprint_edge_m"].get) == "west"


def test_the_committed_aoi_is_inside_the_valid_footprint_with_its_margin():
    handoff_path = ea.DEFAULT_HANDOFF
    new = json.loads(handoff_path.read_text())
    footprint = json.loads((ea.ROOT / "docs/research/r0/DTEEC_009149_1750_009294_1750_U01_footprint.geojson").read_text())
    footprint_m, _ = ea.to_local(new, footprint["geometry"])
    aoi = local_aoi(new)
    margin = new["aoi_proposal"]["enlarged"]["margin_to_footprint_m"]
    assert footprint_m.contains(aoi.buffer(margin - 1e-6, cap_style="square"))
    w, h = new["aoi_proposal"]["size_m"]
    assert aoi.bounds == pytest.approx((-w / 2, -h / 2, w / 2, h / 2), abs=1e-3)
    assert w / h == pytest.approx(2500 / 3500, abs=0.002)
    assert math.isclose(aoi.centroid.x, 0, abs_tol=1e-6)


def test_the_grid_covers_the_aoi_and_keeps_the_stops_inside():
    meta = json.loads((ea.ROOT / "backend/data/gale-bx/meta.json").read_text())
    handoff_doc = json.loads(ea.DEFAULT_HANDOFF.read_text())
    assert meta["center"]["lon"] == handoff_doc["aoi_proposal"]["centre_lonlat_E"][0]
    aoi = shape(handoff_doc["aoi_proposal"]["aoi_geojson"]).bounds
    box_ = meta["bbox"]
    assert box_["lon_min"] <= aoi[0] and box_["lon_max"] >= aoi[2] and box_["lat_min"] <= aoi[1] and box_["lat_max"] >= aoi[3]
    assert meta["cell_m"] == 4.0
    stops = json.loads((ea.ROOT / "backend/data/gale-bx/stops.json").read_text())["stops"]
    for stop in stops:
        assert box_["lon_min"] <= stop["lon"] < box_["lon_max"] and box_["lat_min"] < stop["lat"] <= box_["lat_max"]
