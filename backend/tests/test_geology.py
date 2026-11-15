import json
import shutil

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.geology import read_geology, unit_at
from app.services.grid import DATA_ROOT

META = {"site_id": "t", "bbox": {"lon_min": 0, "lon_max": 10, "lat_min": 0, "lat_max": 10}}
SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
HOLE = [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]]


def doc(features=None, **info):
    base = {
        "schema": "ares.geology/v1",
        "site_id": "t",
        "bbox": META["bbox"],
        "source": {"url": "https://example.org/"},
    }
    return {
        "type": "FeatureCollection",
        "ares": {**base, **info},
        "features": features
        if features is not None
        else [
            {
                "type": "Feature",
                "properties": {"unit": "A", "name": "Unit A"},
                "geometry": {"type": "Polygon", "coordinates": [SQUARE, HOLE]},
            }
        ],
    }


def write(tmp_path, document):
    (tmp_path / "geology.json").write_text(json.dumps(document))
    return tmp_path


def test_unit_at_finds_the_unit_and_respects_holes(tmp_path):
    geo = read_geology(write(tmp_path, doc()), META)
    assert unit_at(geo, 2, 2) == {"unit": "A", "name": "Unit A"}
    assert unit_at(geo, 5, 5) is None  # inside the hole
    assert unit_at(geo, 12, 5) is None


def test_unit_at_reads_a_multipolygon(tmp_path):
    feature = {
        "type": "Feature",
        "properties": {"unit": "M", "name": "Multi"},
        "geometry": {"type": "MultiPolygon", "coordinates": [[SQUARE]]},
    }
    assert unit_at(read_geology(write(tmp_path, doc([feature])), META), 1, 1)["unit"] == "M"


@pytest.mark.parametrize(
    "document",
    [
        doc(schema="other/v1"),
        doc(site_id="elsewhere"),
        doc(bbox={"lon_min": 0, "lon_max": 1, "lat_min": 0, "lat_max": 1}),
        doc(
            [
                {
                    "type": "Feature",
                    "properties": {"unit": "A"},
                    "geometry": {"type": "Polygon", "coordinates": [SQUARE]},
                }
            ]
        ),
        doc(
            [
                {
                    "type": "Feature",
                    "properties": {"unit": "A", "name": "n"},
                    "geometry": {"type": "Point", "coordinates": [1, 1]},
                }
            ]
        ),
        doc(
            [
                {
                    "type": "Feature",
                    "properties": {"unit": "A", "name": "n"},
                    "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [0, 0]]]},
                }
            ]
        ),
    ],
)
def test_a_geology_file_that_does_not_fit_the_site_is_ignored(tmp_path, document):
    assert read_geology(write(tmp_path, document), META) is None


def test_garbage_and_a_missing_file_are_ignored(tmp_path):
    assert read_geology(tmp_path, META) is None
    (tmp_path / "geology.json").write_text("not json")
    assert read_geology(tmp_path, META) is None


# ---- The endpoint, on a copy of the real Gale data ----


@pytest.fixture
def site(tmp_path):
    root = tmp_path / "data"
    shutil.copytree(DATA_ROOT / "gale-bx", root / "gale-bx")
    return root


@pytest.fixture
def real():
    with TestClient(create_app(DATA_ROOT)) as client:
        yield client


def inside(site_id="gale-bx"):
    meta = json.loads((DATA_ROOT / site_id / "meta.json").read_text())
    return meta["center"]["lon"], meta["center"]["lat"]


def test_the_endpoint_names_the_unit_at_a_point_of_the_site(real):
    lon, lat = inside()
    body = real.get("/api/v1/geology", params={"lon": lon, "lat": lat}).json()
    assert body["available"] is True
    assert body["unit"] == "Htu" and body["name"] == "Hesperian transition undivided unit"
    assert body["scale"] == "1:20,000,000" and body["source"]["url"].startswith(
        "https://pubs.usgs.gov/"
    )
    assert "Tanaka" in body["source"]["citation"] and body["site_id"] == "gale-bx"


def test_the_endpoint_says_so_outside_the_covered_area(real):
    body = real.get("/api/v1/geology", params={"lon": 0, "lat": 0}).json()
    assert body == {
        "available": False,
        "reason": "The point is outside the area covered by this site's geology data",
    }


def test_the_endpoint_takes_a_site_and_knows_the_second_site(real):
    lon, lat = inside("gale-001488")
    body = real.get(
        "/api/v1/geology", params={"lon": lon, "lat": lat, "site_id": "gale-001488"}
    ).json()
    assert body["available"] is True and body["site_id"] == "gale-001488"
    assert (
        real.get(
            "/api/v1/geology", params={"lon": lon, "lat": lat, "site_id": "nowhere"}
        ).status_code
        == 404
    )


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"lon": 1},
        {"lon": "x", "lat": 1},
        {"lon": 1, "lat": 91},
        {"lon": 181, "lat": 1},
        {"lon": "nan", "lat": 1},
    ],
)
def test_the_endpoint_validates_its_query(real, params):
    assert real.get("/api/v1/geology", params=params).status_code == 422


def test_a_site_without_the_file_is_not_available(site):
    (site / "gale-bx" / "geology.json").unlink()
    lon, lat = inside()
    with TestClient(create_app(site)) as client:
        body = client.get("/api/v1/geology", params={"lon": lon, "lat": lat})
    assert body.status_code == 200
    assert body.json() == {"available": False, "reason": "No geology data for this site"}


def test_a_broken_file_never_makes_the_site_fail_to_load(site):
    (site / "gale-bx" / "geology.json").write_text("{broken")
    lon, lat = inside()
    with TestClient(create_app(site)) as client:
        assert client.get("/api/v1/health").json()["data_loaded"] is True
        assert (
            client.get("/api/v1/geology", params={"lon": lon, "lat": lat}).json()["available"]
            is False
        )


def test_the_committed_files_belong_to_their_sites():
    for site_id in ("gale-bx", "gale-001488"):
        meta = json.loads((DATA_ROOT / site_id / "meta.json").read_text())
        geo = read_geology(DATA_ROOT / site_id, meta)
        assert geo is not None, site_id
        assert geo["ares"]["source"]["url"] == "https://pubs.usgs.gov/sim/3292/"
