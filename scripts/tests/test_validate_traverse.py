import hashlib
import json
import math

import numpy as np
import pytest

from scripts import validate_traverse as vt

R = 3396190.0
LON0, LAT0 = 137.0, -4.8
CELL, W, H = 10.0, 40, 30
META = {
    "site_id": "t",
    "width": W,
    "height": H,
    "cell_m": CELL,
    "mars_radius_m": R,
    "center": {"lon": LON0, "lat": LAT0},
    "x_min_m": -200.0,
    "y_max_m": 150.0,
}


def lonlat(x, y):
    """The inverse of the projection in docs/DATA_CONTRACT.md, section 4."""
    return (
        LON0 + math.degrees(x / (R * math.cos(math.radians(LAT0)))),
        LAT0 + math.degrees(y / R),
    )


def centre(col, row):
    return lonlat(META["x_min_m"] + (col + 0.5) * CELL, META["y_max_m"] - (row + 0.5) * CELL)


# A tilted plane with a bump: elevation varies, and is known at every cell centre.
ROWS, COLS = np.mgrid[0:H, 0:W]
ELEVATION = (-3600 + 0.8 * COLS - 0.5 * ROWS + 6 * np.sin(COLS / 4.0) * np.cos(ROWS / 5.0)).astype(
    float
)

west, north = lonlat(META["x_min_m"], META["y_max_m"])
east, south = lonlat(META["x_min_m"] + W * CELL, META["y_max_m"] - H * CELL)
BBOX = {"lon_min": west, "lon_max": east, "lat_min": south, "lat_max": north}
META["bbox"] = BBOX


def traverse(vertices):
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "LineString", "coordinates": [list(v) for v in vertices]},
            }
        ],
    }


def cell_vertices(offset, count=60):
    """Vertices on cell centres, with height = our elevation + offset."""
    out = []
    for k in range(count):
        col, row = 2 + (k % 30), 3 + (k * 7) % 22
        lon, lat = centre(col, row)
        out.append((lon, lat, float(ELEVATION[row, col] + offset)))
    return out


SOURCE = {
    "title": "t",
    "url": "https://example.org/t.json",
    "fetched_utc": "2026-01-01T00:00:00Z",
    "sha256": "0" * 64,
    "bytes": 1,
}


def run(vertices, elevation=ELEVATION):
    return vt.build(traverse(vertices), META, elevation, SOURCE, "2026-01-02T00:00:00Z", "1" * 64)


def test_a_known_offset_is_recovered_and_removed():
    doc = run(cell_vertices(offset=-4.5))
    assert doc["status"] == "ok" and doc["n_points"] == 60
    assert doc["raw"]["mean_m"] == pytest.approx(-4.5, abs=1e-9)
    assert doc["raw"]["std_m"] == pytest.approx(0, abs=1e-9)
    assert doc["raw"]["max_abs_m"] == pytest.approx(4.5, abs=1e-9)
    assert doc["raw"]["rmse_m"] == pytest.approx(4.5, abs=1e-9)
    assert doc["offset_corrected"]["offset_m"] == pytest.approx(-4.5, abs=1e-9)
    for key in ("mean_m", "std_m", "max_abs_m", "rmse_m"):
        assert doc["offset_corrected"][key] == pytest.approx(0, abs=1e-9)


def test_noise_shows_in_the_corrected_numbers_but_not_in_the_offset():
    rng = np.random.default_rng(1)
    noise = rng.normal(0, 2.0, 400)
    vertices = [
        (lon, lat, z + float(n))
        for (lon, lat, z), n in zip(cell_vertices(offset=7.0, count=400), noise, strict=True)
    ]
    doc = run(vertices)
    assert doc["n_points"] >= 30
    assert doc["offset_corrected"]["offset_m"] == pytest.approx(7.0, abs=0.5)
    assert doc["offset_corrected"]["std_m"] == pytest.approx(2.0, abs=0.4)
    assert doc["raw"]["rmse_m"] > doc["offset_corrected"]["rmse_m"]


def test_the_statistics_agree_with_each_other():
    doc = run(
        cell_vertices(offset=3.0)[:40]
        + [(lon, lat, z + 5) for lon, lat, z in cell_vertices(offset=3.0)[40:]]
    )
    raw, fixed = doc["raw"], doc["offset_corrected"]
    assert fixed["offset_m"] == pytest.approx(raw["mean_m"])
    assert fixed["std_m"] == pytest.approx(raw["std_m"])
    assert fixed["rmse_m"] == pytest.approx(fixed["std_m"])
    assert raw["rmse_m"] ** 2 == pytest.approx(raw["mean_m"] ** 2 + raw["std_m"] ** 2)


def test_bilinear_sampling_between_cell_centres():
    lon, lat = lonlat(
        META["x_min_m"] + 11 * CELL, META["y_max_m"] - 6 * CELL
    )  # the corner shared by cells (10,5), (10,6), (11,5), (11,6)
    expected = ELEVATION[5:7, 10:12].mean()
    assert vt.sample_elevation(ELEVATION, META, lon, lat) == pytest.approx(expected)


def test_sampling_is_none_outside_the_grid_and_next_to_no_data():
    assert vt.sample_elevation(ELEVATION, META, *lonlat(-500, 0)) is None
    holed = ELEVATION.copy()
    holed[10, 10] = np.nan
    assert vt.sample_elevation(holed, META, *centre(10, 10)) is None
    assert vt.sample_elevation(holed, META, *centre(20, 20)) is not None


def test_vertices_outside_the_bbox_and_repeats_are_not_counted():
    inside = cell_vertices(offset=2.0)
    far = [
        (BBOX["lon_max"] + 0.5, BBOX["lat_min"], -3000.0),
        (BBOX["lon_min"] - 0.5, BBOX["lat_max"], -3000.0),
    ]
    doc = run(inside + far + inside[:10])  # ten vertices where two segments meet, written twice
    assert doc["n_points"] == 60
    assert doc["n_repeats_removed"] == 10
    assert doc["n_vertices_in_bbox"] == 70


def test_vertices_on_no_data_are_skipped_and_counted():
    holed = ELEVATION.copy()
    lon, lat, _ = cell_vertices(0.0)[0]
    col, row = 2, 3
    holed[row, col] = np.nan
    doc = run(cell_vertices(offset=1.0), elevation=holed)
    assert doc["n_skipped_no_data"] >= 1 and doc["n_points"] == 60 - doc["n_skipped_no_data"]


def test_too_few_vertices_say_so_and_carry_no_statistics():
    doc = run(cell_vertices(offset=1.0, count=29))
    assert doc["status"] == "insufficient_points" and "29" in doc["reason"]
    assert "raw" not in doc and "offset_corrected" not in doc
    assert run(cell_vertices(offset=1.0, count=30))["status"] == "ok"


def test_vertices_without_a_height_cannot_be_compared():
    flat = [(lon, lat) for lon, lat, _ in cell_vertices(0.0)]
    doc = run(flat)
    assert (
        doc["status"] == "insufficient_points"
        and doc["n_without_height"] == 60
        and doc["n_points"] == 0
    )


def test_heights_that_do_not_vary_together_are_not_comparable():
    rng = np.random.default_rng(2)
    vertices = [
        (lon, lat, float(-3500 + rng.uniform(-30, 30)))
        for lon, lat, _ in cell_vertices(0.0, count=200)
    ]
    doc = run(vertices)
    assert doc["status"] == "not_comparable" and "do not vary together" in doc["reason"]
    assert "raw" not in doc


def test_a_flat_traverse_is_not_comparable():
    vertices = [(lon, lat, -3600.0) for lon, lat, _ in cell_vertices(0.0)]
    assert run(vertices)["status"] == "not_comparable"


def test_the_document_carries_the_method_the_source_and_the_reason_for_an_offset():
    doc = run(cell_vertices(offset=1.0))
    assert doc["schema"] == "ares.validation/v1" and doc["site_id"] == "t" and doc["bbox"] == BBOX
    assert "difference = traverse z minus our elevation" in doc["method"]
    assert "constant offset" in doc["offset_note"] and "reference" in doc["offset_note"]
    assert (
        doc["source"] == SOURCE
        and doc["elevation_sha256"] == "1" * 64
        and doc["computed_utc"] == "2026-01-02T00:00:00Z"
    )


def test_a_file_that_is_not_a_traverse_is_refused():
    with pytest.raises(ValueError):
        vt.build({"type": "Feature"}, META, ELEVATION, SOURCE, "t", "h")
    with pytest.raises(ValueError):
        vt.build({"type": "FeatureCollection", "features": []}, META, ELEVATION, SOURCE, "t", "h")


def test_main_writes_validation_json_next_to_the_grid(tmp_path, capsys):
    folder = tmp_path / "data" / "t"
    folder.mkdir(parents=True)
    (folder / "meta.json").write_text(json.dumps({**META, "bbox": BBOX}))
    (folder / "elevation.bin").write_bytes(ELEVATION.astype("<f4").tobytes())
    source = tmp_path / "traverse.json"
    source.write_text(json.dumps(traverse(cell_vertices(offset=-4.5))))
    assert (
        vt.main(["--site", "t", "--data-root", str(tmp_path / "data"), "--input", str(source)]) == 0
    )
    doc = json.loads((folder / "validation.json").read_text())
    assert doc["status"] == "ok" and doc["offset_corrected"]["offset_m"] == pytest.approx(
        -4.5, abs=1e-4
    )
    assert doc["source"]["sha256"] and len(doc["elevation_sha256"]) == 64
    out = capsys.readouterr().out
    assert "can exist because" in out and "Raw:" in out


def test_main_reports_a_result_it_cannot_make_instead_of_forcing_one(tmp_path, capsys):
    folder = tmp_path / "data" / "t"
    folder.mkdir(parents=True)
    (folder / "meta.json").write_text(json.dumps({**META, "bbox": BBOX}))
    (folder / "elevation.bin").write_bytes(ELEVATION.astype("<f4").tobytes())
    source = tmp_path / "traverse.json"
    source.write_text(json.dumps(traverse(cell_vertices(offset=1.0, count=5))))
    assert (
        vt.main(["--site", "t", "--data-root", str(tmp_path / "data"), "--input", str(source)]) == 0
    )
    doc = json.loads((folder / "validation.json").read_text())
    assert doc["status"] == "insufficient_points" and "raw" not in doc
    assert "insufficient_points" in capsys.readouterr().out


def test_the_committed_file_is_consistent_with_itself_and_the_grid():
    path = vt.ROOT / "backend/data/gale-bx/validation.json"
    doc = json.loads(path.read_text())
    meta = json.loads((vt.ROOT / "backend/data/gale-bx/meta.json").read_text())
    assert doc["schema"] == "ares.validation/v1" and doc["bbox"] == meta["bbox"]
    assert doc["source"]["url"] == vt.URL and doc["source"]["fetched_utc"].endswith("Z")
    assert doc["status"] == "ok" and doc["n_points"] >= vt.MIN_POINTS
    raw, fixed = doc["raw"], doc["offset_corrected"]
    assert fixed["offset_m"] == pytest.approx(raw["mean_m"]) and fixed["rmse_m"] == pytest.approx(
        raw["std_m"]
    )
    assert raw["rmse_m"] ** 2 == pytest.approx(raw["mean_m"] ** 2 + raw["std_m"] ** 2, rel=1e-6)
    assert fixed["max_abs_m"] <= raw["max_abs_m"] + abs(raw["mean_m"]) + 1e-6
    assert (
        doc["elevation_sha256"]
        == hashlib.sha256((vt.ROOT / "backend/data/gale-bx/elevation.bin").read_bytes()).hexdigest()
    )
