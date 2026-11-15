import json

import pytest

from scripts import fetch_traverse as ft

AOI = (10.0, 10.1, 5.0, 5.1)


def collection(*lines, kind="LineString"):
    if kind == "LineString":
        features = [{"type": "Feature", "properties": {}, "geometry": {"type": "LineString", "coordinates": [[x, y, -4000.0] for x, y in line]}} for line in lines]
    else:
        features = [{"type": "Feature", "properties": {}, "geometry": {"type": "MultiLineString", "coordinates": [[[x, y, -4000.0] for x, y in line] for line in lines]}}]
    return {"type": "FeatureCollection", "features": features}


def test_clip_segment_cuts_at_the_box_edge():
    seg = ft.clip_segment((9.0, 5.05), (11.0, 5.05), AOI)
    assert seg == ((10.0, 5.05), (10.1, 5.05))
    assert ft.clip_segment((9.0, 6.0), (11.0, 6.0), AOI) is None


def test_a_line_that_leaves_and_returns_becomes_two_pieces():
    line = [(10.02, 5.05), (10.05, 5.05), (10.05, 5.5), (10.06, 5.5), (10.06, 5.05), (10.08, 5.05)]
    pieces = ft.clip_lines([line], AOI)
    assert len(pieces) == 2
    assert pieces[0][0] == (10.02, 5.05) and pieces[1][-1] == (10.08, 5.05)


def test_simplify_keeps_the_ends_and_a_real_corner():
    straight = [(10.0 + i * 0.001, 5.0) for i in range(50)]
    assert ft.simplify(straight, 1.0, 10.0, 5.0) == [straight[0], straight[-1]]
    corner = straight[:25] + [(10.024, 5.0 + i * 0.001) for i in range(1, 25)]
    out = ft.simplify(corner, 1.0, 10.0, 5.0)
    assert (10.024, 5.0) in out and len(out) == 3


def test_simplify_handles_a_long_line_without_recursion_error():
    line = [(10.0 + i * 1e-6, 5.0 + (i % 2) * 1e-7) for i in range(20000)]
    assert len(ft.simplify(line, 0.5, 10.0, 5.0)) >= 2


def test_build_inside_the_aoi_reports_it_and_drops_elevations():
    doc = ft.build(collection([(10.02, 5.02), (10.05, 5.05), (10.08, 5.08)], kind="Multi"), AOI, 0.01, 1.0)
    assert doc["ares"]["intersects_aoi"] is True
    assert doc["ares"]["nearest_to_aoi"]["distance_m"] == 0
    coords = doc["features"][0]["geometry"]["coordinates"]
    assert all(len(p) == 2 for line in coords for p in line)
    assert doc["ares"]["source_vertices"] == 3


def test_build_far_from_the_aoi_still_keeps_the_nearest_part():
    far = [(10.5 + i * 0.01, 5.0) for i in range(20)]
    doc = ft.build(collection(far), AOI, 0.01, 1.0)
    assert doc["ares"]["intersects_aoi"] is False
    assert doc["ares"]["nearest_to_aoi"]["distance_m"] > 20_000
    kept = doc["features"][0]["geometry"]["coordinates"]
    assert kept and all(abs(p[0] - 10.5) < 0.2 for line in kept for p in line)


def test_a_file_that_is_not_a_traverse_is_refused():
    with pytest.raises(ValueError):
        ft.build({"type": "Feature"}, AOI, 0.01, 1.0)
    with pytest.raises(ValueError):
        ft.build({"type": "FeatureCollection", "features": []}, AOI, 0.01, 1.0)


def test_main_writes_a_small_file_from_a_local_input(tmp_path):
    source = tmp_path / "in.json"
    source.write_text(json.dumps(collection([(10.02 + i * 0.0005, 5.02 + (i % 3) * 1e-5) for i in range(100)])))
    out = tmp_path / "out.json"
    assert ft.main(["--input", str(source), "--output", str(out), "--aoi", "10", "10.1", "5", "5.1"]) == 0
    doc = json.loads(out.read_text())
    assert doc["ares"]["schema"] == "ares.traverse/v1"
    assert doc["ares"]["source"]["sha256"] and doc["ares"]["source"]["fetched_utc"].endswith("Z")


def test_the_committed_file_follows_the_contract():
    from pathlib import Path

    doc = json.loads((ft.OUTPUT).read_text())
    a = doc["ares"]
    assert a["schema"] == "ares.traverse/v1" and a["source"]["url"].startswith("https://")
    assert (ft.OUTPUT).stat().st_size < ft.SIZE_LIMIT_BYTES
    lines = doc["features"][0]["geometry"]["coordinates"]
    assert lines and all(len(p) == 2 for line in lines for p in line)
    assert a["kept_vertices"] == sum(len(line) for line in lines)
    box = a["clip_bbox"]
    assert all(box["lon_min"] - 1e-6 <= p[0] <= box["lon_max"] + 1e-6 and box["lat_min"] - 1e-6 <= p[1] <= box["lat_max"] + 1e-6 for line in lines for p in line)
