import hashlib
import json
import shutil

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.grid import DATA_ROOT
from app.services.validation import read_validation


@pytest.fixture
def site(tmp_path):
    root = tmp_path / "data"
    shutil.copytree(DATA_ROOT / "gale-bx", root / "gale-bx")
    return root


def doc_for(root, **changes):
    folder = root / "gale-bx"
    meta = json.loads((folder / "meta.json").read_text())
    doc = {
        "schema": "ares.validation/v1",
        "site_id": "gale-bx",
        "bbox": meta["bbox"],
        "status": "ok",
        "n_points": 100,
        "raw": {"mean_m": -4.0, "std_m": 2.0, "max_abs_m": 9.0, "rmse_m": 4.5},
        "offset_corrected": {
            "offset_m": -4.0,
            "mean_m": 0.0,
            "std_m": 2.0,
            "max_abs_m": 5.0,
            "rmse_m": 2.0,
        },
        "elevation_sha256": hashlib.sha256((folder / "elevation.bin").read_bytes()).hexdigest(),
    }
    doc.update(changes)
    (folder / "validation.json").write_text(json.dumps(doc))
    return folder, meta


def answer(root):
    with TestClient(create_app(root)) as client:
        response = client.get("/api/v1/validation")
    assert response.status_code == 200
    return response.json()


def test_the_endpoint_returns_the_committed_file():
    with TestClient(create_app(DATA_ROOT)) as client:
        body = client.get("/api/v1/validation").json()
    file = json.loads((DATA_ROOT / "gale-bx" / "validation.json").read_text())
    assert body == {"available": True, **file}
    assert body["status"] == "ok" and body["n_points"] >= 30
    assert body["source"]["url"].startswith("https://mars.nasa.gov/") and body["source"][
        "fetched_utc"
    ].endswith("Z")


def test_the_endpoint_takes_a_site_and_knows_the_second_site_has_none():
    with TestClient(create_app(DATA_ROOT)) as client:
        body = client.get("/api/v1/validation", params={"site_id": "gale-001488"}).json()
        assert body == {"available": False, "reason": "No validation has been run for this site"}
        assert client.get("/api/v1/validation", params={"site_id": "nowhere"}).status_code == 404


def test_a_missing_file_says_so(site):
    (site / "gale-bx" / "validation.json").unlink(missing_ok=True)
    assert answer(site) == {
        "available": False,
        "reason": "No validation has been run for this site",
    }


def test_a_valid_file_is_served_with_available_true(site):
    doc_for(site)
    body = answer(site)
    assert body["available"] is True and body["raw"]["mean_m"] == -4.0


def test_insufficient_and_not_comparable_results_are_served_as_they_are(site):
    doc_for(
        site, status="insufficient_points", reason="Only 3 traverse vertices fall inside the site."
    )
    body = answer(site)
    assert (
        body["available"] is True
        and body["status"] == "insufficient_points"
        and "Only 3" in body["reason"]
    )


@pytest.mark.parametrize(
    "changes, reason",
    [
        ({"site_id": "other"}, "another site"),
        ({"schema": "x/v1"}, "another site"),
        ({"bbox": {"lon_min": 0, "lon_max": 1, "lat_min": 0, "lat_max": 1}}, "another site"),
        ({"elevation_sha256": "0" * 64}, "different elevation.bin"),
        ({"status": "great"}, "could not be read"),
    ],
)
def test_a_file_that_does_not_describe_this_terrain_is_not_served(site, changes, reason):
    doc_for(site, **changes)
    body = answer(site)
    assert body["available"] is False and reason in body["reason"]


def test_an_ok_result_without_statistics_is_refused(site):
    folder, _ = doc_for(site)
    doc = json.loads((folder / "validation.json").read_text())
    del doc["raw"]
    (folder / "validation.json").write_text(json.dumps(doc))
    assert answer(site)["available"] is False


def test_garbage_never_makes_the_site_fail_to_load(site):
    (site / "gale-bx" / "validation.json").write_text("{broken")
    with TestClient(create_app(site)) as client:
        assert client.get("/api/v1/health").json()["data_loaded"] is True
        assert client.get("/api/v1/validation").json() == {
            "available": False,
            "reason": "validation.json could not be read",
        }


def test_read_validation_returns_the_same_thing_the_endpoint_serves(site):
    folder, meta = doc_for(site)
    assert read_validation(folder, meta)["available"] is True
