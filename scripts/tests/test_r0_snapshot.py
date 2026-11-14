import hashlib
import json
from pathlib import Path

import pytest

from scripts.r0_snapshot import reproduce_snapshot
from scripts.r0_sources import MANIFEST


def test_snapshot_recipe_reproduces_pinned_bytes(tmp_path):
    entry = json.loads(MANIFEST.read_text())["inputs"][0]
    frozen = (MANIFEST.parent / entry["snapshot"]).read_bytes()
    collection = json.loads(frozen)
    # Unrelated new sols in the live catalogue must not change the frozen campaign.
    outside = json.loads(json.dumps(collection["features"][0]))
    outside["properties"]["sol"] = 9999
    collection["features"].insert(0, outside)
    source = json.dumps(collection).encode()
    reproduced = reproduce_snapshot(source, entry)
    assert reproduced == frozen
    assert hashlib.sha256(reproduced).hexdigest() == entry["sha256"]


def test_changed_campaign_cannot_silently_replace_snapshot():
    entry = json.loads(MANIFEST.read_text())["inputs"][0]
    collection = json.loads((MANIFEST.parent / entry["snapshot"]).read_bytes())
    collection["features"][0]["geometry"]["coordinates"][0] += 0.001
    with pytest.raises(ValueError, match="snapshot differs"):
        reproduce_snapshot(json.dumps(collection).encode(), entry)


def test_snapshot_provenance_has_date_filter_and_recipe():
    entry = json.loads(MANIFEST.read_text())["inputs"][0]
    provenance = entry["provenance"]
    assert provenance["retrieved_on"] == "2026-11-14"
    assert provenance["filter"] == {
        "field": "sol",
        "minimum": 4534,
        "maximum": 4805,
        "inclusive": True,
        "order": "stable ascending sol",
    }
    assert provenance["source_bytes"] == 665124
    assert len(provenance["source_sha256"]) == 64
    assert "scripts.r0_snapshot" in provenance["reproduce_command"]
    assert Path(MANIFEST.parent / entry["snapshot"]).is_file()
