"""Bind a supplied planning review to the exact AOI, points and elevation product."""

from __future__ import annotations

import hashlib
import json
from datetime import date


def extent_digest(proposal: dict, metadata: dict, points_sha256: str | None) -> str:
    content = {
        "product_id": metadata["product_id"],
        "dtm_sha256": metadata.get("source_sha256"),
        "native_crs": metadata["crs_wkt"],
        "pixel_size_m": metadata["pixel_size_m"],
        "aoi": proposal["aoi_geojson"],
        "crs_proj": proposal["crs_proj"],
        "buffer": proposal["buffer"],
        "points_sha256": points_sha256,
    }
    encoded = json.dumps(content, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    return hashlib.sha256(encoded).hexdigest()


def apply_approval(
    proposal: dict,
    metadata: dict,
    points: list[dict],
    points_sha256: str | None,
    approval: dict | None,
) -> None:
    proposal["extent_sha256"] = extent_digest(proposal, metadata, points_sha256)
    proposal["planning_points_sha256"] = points_sha256
    proposal["planning_approval"] = None
    if approval is None:
        return
    if not isinstance(approval, dict):
        raise ValueError("Planning approval must be a JSON object")
    roles = {
        role for point in points if isinstance(role := point.get("properties", {}).get("role"), str)
    }
    checks = approval.get("checks", {})
    try:
        date.fromisoformat(approval.get("reviewed_on", ""))
        valid_date = True
    except (TypeError, ValueError):
        valid_date = False
    evidence = approval.get("evidence")
    reviewer = approval.get("reviewer")
    if (
        approval.get("schema") != "ares.r0-planning-approval/v1"
        or not isinstance(reviewer, str)
        or not reviewer.strip()
        or not valid_date
        or not isinstance(evidence, list)
        or not evidence
        or not all(isinstance(item, str) and item.strip() for item in evidence)
        or not {"habitat", "target"}.issubset(roles)
        or not isinstance(points_sha256, str)
        or len(points_sha256) != 64
        or not metadata.get("source_sha256")
        or approval.get("planning_points_sha256") != points_sha256
        or approval.get("extent_sha256") != proposal["extent_sha256"]
        or not isinstance(checks, dict)
        or not all(
            checks.get(key) is True
            for key in ("r6_targets_finalized", "d9_habitat_finalized", "terrain_qa_passed")
        )
    ):
        raise ValueError(
            "Planning approval must document R6/D9 and terrain QA, reviewer/date/evidence, "
            "include habitat and target roles, and match the current points and extent hashes"
        )
    proposal["planning_ready"] = True
    proposal["planning_approval"] = approval
    proposal["status"] = (
        "reviewed extent ready for Region Config import; supplied approval recorded"
    )
