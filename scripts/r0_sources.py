"""Pinned inputs and local verification receipts for the R0 research workflow."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import requests

MANIFEST = Path(__file__).with_name("r0_inputs.json")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def signature(path: Path) -> dict:
    stat = path.stat()
    return {
        "size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
        "ctime_ns": stat.st_ctime_ns,
        "inode": stat.st_ino,
    }


def receipt_path(path: Path) -> Path:
    return path.with_name(path.name + ".verified.json")


def save_receipt(path: Path, digest: str) -> None:
    receipt_path(path).write_text(
        json.dumps({"signature": signature(path), "sha256": digest}) + "\n", encoding="utf-8"
    )


def validate_cached(path: Path, expected: str, *, force: bool = False) -> str:
    """Reuse local attestation only while the file's identity and metadata match.

    Receipts optimize an ordinary local cache, not an adversarial filesystem.
    --verify-inputs bypasses receipts for a fresh full integrity audit.
    """
    before = signature(path)
    try:
        receipt = json.loads(receipt_path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        receipt = {}
    if not force and receipt == {"signature": before, "sha256": expected}:
        return expected
    actual = sha256(path)
    if actual != expected or signature(path) != before:
        raise ValueError(f"SHA-256 mismatch or file changed during verification: {path}")
    save_receipt(path, actual)
    return actual


def download(url: str, path: Path, expected: str, size: int) -> str:
    """Hash decoded bytes while streaming; never publish unverified downloads."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    digest, length = hashlib.sha256(), 0
    try:
        with requests.get(url, stream=True, timeout=(15, 90)) as response:
            response.raise_for_status()
            if response.status_code != 200:
                raise ValueError(f"Expected full download, got HTTP {response.status_code}: {url}")
            with temporary.open("wb") as stream:
                for block in response.iter_content(1024 * 1024):
                    stream.write(block)
                    digest.update(block)
                    length += len(block)
            # Content-Length describes the wire representation; requests decodes gzip.
            wire_size = response.headers.get("Content-Length")
            encoding = response.headers.get("Content-Encoding", "identity").lower()
            if wire_size and encoding == "identity" and length != int(wire_size):
                raise ValueError(f"Incomplete download: {url}")
        actual = digest.hexdigest()
        if actual != expected:
            raise ValueError(f"SHA-256 mismatch for pinned source: {url}")
        if length != size:
            raise ValueError(f"Decoded size mismatch for pinned source: {url}")
        temporary.replace(path)
        save_receipt(path, actual)
        return actual
    finally:
        temporary.unlink(missing_ok=True)


def load_inputs(raw: Path, manifest: Path, *, fetch: bool, force: bool) -> tuple[dict, list]:
    inputs, records = {}, []
    for entry in json.loads(manifest.read_text(encoding="utf-8"))["inputs"]:
        snapshot = entry.get("snapshot")
        path = manifest.parent / snapshot if snapshot else raw / entry["file"]
        if snapshot:
            # Small, committed snapshot; never trust a receipt for source code.
            digest = sha256(path)
            if digest != entry["sha256"]:
                raise ValueError(f"SHA-256 mismatch for committed waypoint snapshot: {path}")
        elif path.exists():
            digest = validate_cached(path, entry["sha256"], force=force)
        elif fetch:
            print(f"Downloading {entry['file']}", flush=True)
            digest = download(entry["url"], path, entry["sha256"], entry["bytes"])
        else:
            raise FileNotFoundError(f"Missing {path}; run with --download")
        if path.stat().st_size != entry["bytes"]:
            raise ValueError(f"Pinned input size mismatch: {path}")
        inputs[entry["role"] if snapshot else entry["product_id"]] = path
        record = {key: entry[key] for key in ("file", "url", "bytes")} | {"sha256": digest}
        if snapshot:
            record["snapshot_relative_to_manifest"] = snapshot
        records.append(record)
    return inputs, records
