"""The check of a site's terrain against Curiosity's measured traverse.

Format: docs/DATA_CONTRACT.md, section 12.

scripts/validate_traverse.py writes validation.json next to meta.json. It is read once when
the site loads, and the answer of GET /api/v1/validation is built here. A file that is missing,
unreadable, or made for another site, bbox or elevation.bin is reported as "not available" with
the reason, never served as if it described the current terrain.
"""

import hashlib
import json
import logging
from pathlib import Path

SCHEMA = "ares.validation/v1"
logger = logging.getLogger(__name__)


def unavailable(reason: str) -> dict:
    return {"available": False, "reason": reason}


def read_validation(directory: Path, meta: dict) -> dict:
    """The endpoint's answer: the file with `available: true`, or `available: false` and why."""
    path = directory / "validation.json"
    if not path.exists():
        return unavailable("No validation has been run for this site")
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
        if (
            doc["schema"] != SCHEMA
            or doc["site_id"] != meta["site_id"]
            or doc["bbox"] != meta["bbox"]
        ):
            return unavailable("validation.json was made for another site or area")
        if doc["status"] not in ("ok", "insufficient_points", "not_comparable"):
            raise ValueError("unknown status")
        if doc["status"] == "ok" and not all(
            k in doc for k in ("raw", "offset_corrected", "n_points")
        ):
            raise ValueError("an ok result without its statistics")
        if (
            doc["elevation_sha256"]
            != hashlib.sha256((directory / "elevation.bin").read_bytes()).hexdigest()
        ):
            return unavailable(
                "validation.json was made for a different elevation.bin; "
                "run python -m scripts.validate_traverse again"
            )
    except (OSError, ValueError, KeyError, TypeError):
        logger.exception("Ignoring validation file %s", path)
        return unavailable("validation.json could not be read")
    return {"available": True, **doc}
