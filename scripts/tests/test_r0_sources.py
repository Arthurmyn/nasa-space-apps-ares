import gzip
import hashlib
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from scripts import r0_sources


@pytest.fixture
def gzip_source():
    payload = b'{"features": []}' * 100
    compressed = gzip.compress(payload)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(compressed)))
            self.end_headers()
            self.wfile.write(compressed)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/data", payload
    finally:
        server.shutdown()
        thread.join()
        server.server_close()


def test_gzip_download_checks_decoded_hash_and_size(gzip_source, tmp_path):
    url, payload = gzip_source
    path = tmp_path / "data.json"
    path.write_bytes(b"previously accepted input")
    digest = hashlib.sha256(payload).hexdigest()
    assert r0_sources.download(url, path, digest, len(payload)) == digest
    assert path.read_bytes() == payload


def test_changed_upstream_does_not_replace_pinned_input(gzip_source, tmp_path):
    url, payload = gzip_source
    path = tmp_path / "data.json"
    path.write_bytes(b"previously accepted input")
    with pytest.raises(ValueError, match="SHA-256"):
        r0_sources.download(url, path, "0" * 64, len(payload))
    assert path.read_bytes() == b"previously accepted input"
    assert not path.with_suffix(".json.part").exists()


def test_cache_verifies_pins_and_rechecks_modified_file(tmp_path):
    path = tmp_path / "raster.IMG"
    path.write_bytes(b"original")
    digest = hashlib.sha256(b"original").hexdigest()
    assert r0_sources.validate_cached(path, digest) == digest
    path.write_bytes(b"corrupted")
    with pytest.raises(ValueError, match="SHA-256"):
        r0_sources.validate_cached(path, digest)


def test_unchanged_cache_reuses_verified_digest(tmp_path, monkeypatch):
    path = tmp_path / "raster.IMG"
    path.write_bytes(b"original")
    digest = hashlib.sha256(b"original").hexdigest()
    r0_sources.validate_cached(path, digest)

    def unexpected_read(_path):
        raise AssertionError("unchanged raster was hashed again")

    monkeypatch.setattr(r0_sources, "sha256", unexpected_read)
    assert r0_sources.validate_cached(path, digest) == digest


def test_force_verification_rehashes_even_with_receipt(tmp_path, monkeypatch):
    path = tmp_path / "raster.IMG"
    path.write_bytes(b"original")
    digest = hashlib.sha256(b"original").hexdigest()
    r0_sources.validate_cached(path, digest)
    monkeypatch.setattr(r0_sources, "sha256", lambda _path: "0" * 64)
    with pytest.raises(ValueError, match="SHA-256"):
        r0_sources.validate_cached(path, digest, force=True)


def test_receipt_for_different_pin_is_not_accepted(tmp_path):
    path = tmp_path / "raster.IMG"
    path.write_bytes(b"original")
    digest = hashlib.sha256(b"original").hexdigest()
    r0_sources.validate_cached(path, digest)
    with pytest.raises(ValueError, match="SHA-256"):
        r0_sources.validate_cached(path, "0" * 64)
