import json
import struct

import pytest

from scripts import make_geology as mg


def ring(points):
    return points + [points[0]]


def polygon_record(rings):
    flat = [p for r in rings for p in r]
    xs, ys = [p[0] for p in flat], [p[1] for p in flat]
    starts, n = [], 0
    for r in rings:
        starts.append(n)
        n += len(r)
    body = struct.pack("<i4d2i", 5, min(xs), min(ys), max(xs), max(ys), len(rings), len(flat))
    body += struct.pack(f"<{len(starts)}i", *starts) + b"".join(
        struct.pack("<2d", *p) for p in flat
    )
    return body


def write_shapefile(path, polygons, rows):
    """polygons: ring lists; outer rings clockwise, holes counter-clockwise (the ESRI way)."""
    records = b""
    for i, rings in enumerate(polygons, 1):
        body = polygon_record(rings)
        records += struct.pack(">2i", i, len(body) // 2) + body
    all_points = [p for rings in polygons for r in rings for p in r]
    xs, ys = [p[0] for p in all_points], [p[1] for p in all_points]
    length_words = (100 + len(records)) // 2
    header = struct.pack(">7i", 9994, 0, 0, 0, 0, 0, length_words)
    header += struct.pack("<2i8d", 1000, 5, min(xs), min(ys), max(xs), max(ys), 0, 0, 0, 0)
    path.write_bytes(header + records)
    fields = [("Unit", 8), ("UnitDesc", 50)]
    record_len = 1 + sum(n for _, n in fields)
    dbf = struct.pack("<4BIHH20x", 3, 126, 1, 1, len(rows), 32 + 32 * len(fields) + 1, record_len)
    for name, length in fields:
        dbf += name.encode().ljust(11, b"\0") + b"C" + b"\0" * 4 + bytes([length, 0]) + b"\0" * 14
    dbf += b"\x0d"
    for row in rows:
        dbf += b" " + b"".join(row[name].encode().ljust(n) for name, n in fields)
    path.with_suffix(".dbf").write_bytes(dbf + b"\x1a")


def CW(x0, y0, x1, y1):  # clockwise: an outer ring
    return ring([(x0, y0), (x0, y1), (x1, y1), (x1, y0)])


def CCW(x0, y0, x1, y1):  # counter-clockwise: a hole
    return ring([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


BBOX = {"lon_min": 10.0, "lon_max": 11.0, "lat_min": 5.0, "lat_max": 6.0}


@pytest.fixture
def shapefile(tmp_path):
    path = tmp_path / "geo.shp"
    write_shapefile(
        path,
        [
            [CW(0, 0, 20, 10), CCW(5, 3, 6, 4)],  # a big unit around the bbox
            [CW(40, 40, 50, 50)],  # far away
        ],
        [
            {"Unit": "Aa", "UnitDesc": "Amazonian A unit"},
            {"Unit": "Hb", "UnitDesc": "Hesperian B unit"},
        ],
    )
    return path


def test_the_dbf_is_read(shapefile):
    assert mg.read_dbf(shapefile.with_suffix(".dbf")) == [
        {"Unit": "Aa", "UnitDesc": "Amazonian A unit"},
        {"Unit": "Hb", "UnitDesc": "Hesperian B unit"},
    ]


def test_only_polygons_that_meet_the_window_are_read(shapefile):
    found = list(mg.read_polygons(shapefile, (10, 5, 11, 6)))
    assert [i for i, _ in found] == [0]
    assert found[0][1].area == pytest.approx(199)


def test_a_hole_is_a_hole(shapefile):
    ((_, geometry),) = mg.read_polygons(shapefile, (5.2, 3.2, 5.8, 3.8))
    assert geometry.area == pytest.approx(200 - 1)


def test_build_clips_to_the_bbox_and_names_the_unit_as_the_map_does(shapefile):
    doc = mg.build(shapefile, BBOX, "t")
    (feature,) = doc["features"]
    assert feature["properties"] == {
        "unit": "Aa",
        "name": "Amazonian A unit",
        "source_url": mg.PAGE_URL,
    }
    xs = [p[0] for p in feature["geometry"]["coordinates"][0]]
    assert min(xs) == 10 and max(xs) == 11
    assert doc["ares"]["schema"] == "ares.geology/v1" and doc["ares"]["scale"] == "1:20,000,000"
    assert doc["ares"]["bbox"] == BBOX and "Tanaka" in doc["ares"]["source"]["citation"]


def test_build_refuses_to_guess_when_no_unit_covers_the_site(shapefile):
    with pytest.raises(ValueError, match="No SIM 3292 unit"):
        mg.build(shapefile, {"lon_min": 100, "lon_max": 101, "lat_min": 60, "lat_max": 61}, "t")


def test_main_writes_the_file_next_to_meta_json(shapefile, tmp_path):
    root = tmp_path / "data"
    (root / "t").mkdir(parents=True)
    (root / "t" / "meta.json").write_text(json.dumps({"site_id": "t", "bbox": BBOX}))
    assert mg.main(["--site", "t", "--data-root", str(root), "--shapefile", str(shapefile)]) == 0
    doc = json.loads((root / "t" / "geology.json").read_text())
    assert doc["ares"]["source"]["shapefile_sha256"] and doc["ares"]["source"][
        "fetched_utc"
    ].endswith("Z")


def test_main_exits_with_an_error_when_nothing_covers_the_site(shapefile, tmp_path, capsys):
    root = tmp_path / "data"
    (root / "t").mkdir(parents=True)
    far = {"lon_min": 100, "lon_max": 101, "lat_min": 60, "lat_max": 61}
    (root / "t" / "meta.json").write_text(json.dumps({"site_id": "t", "bbox": far}))
    assert mg.main(["--site", "t", "--data-root", str(root), "--shapefile", str(shapefile)]) == 1
    assert not (root / "t" / "geology.json").exists()
    assert "No SIM 3292 unit" in capsys.readouterr().err


def test_the_committed_files_follow_the_contract():
    for site in ("gale-bx", "gale-001488"):
        doc = json.loads((mg.ROOT / "backend/data" / site / "geology.json").read_text())
        meta = json.loads((mg.ROOT / "backend/data" / site / "meta.json").read_text())
        assert doc["ares"]["site_id"] == site and doc["ares"]["bbox"] == meta["bbox"]
        assert doc["features"] and all(
            f["properties"]["unit"] and f["properties"]["name"] for f in doc["features"]
        )
