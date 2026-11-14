"""Smoke-test an extracted Vercel function using its own vendored dependencies.

Run on Linux with Python 3.12, passing backend/.vercel/verified-function.
No packages from the repository or a developer environment are imported.
"""

import json
import math
import site
import sys
from pathlib import Path
from time import perf_counter

bundle = Path(sys.argv[1]).resolve()
site.addsitedir(str(bundle / "_vendor"))
sys.path[:0] = [str(bundle), str(bundle / "_vendor")]

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

assert Path(sys.modules["app.main"].__file__).is_relative_to(bundle)

meta = json.loads((bundle / "data/gale-bx/meta.json").read_text())
assert meta["is_test_data"] is True


def point(row, col, id):
    radius = meta["mars_radius_m"]
    x = meta["x_min_m"] + (col + 0.5) * meta["cell_m"]
    y = meta["y_max_m"] - (row + 0.5) * meta["cell_m"]
    return {
        "id": id,
        "lon": meta["center"]["lon"]
        + math.degrees(x / (radius * math.cos(math.radians(meta["center"]["lat"])))),
        "lat": meta["center"]["lat"] + math.degrees(y / radius),
    }


with TestClient(app) as client:
    assert client.get("/api/v1/health").json()["data_loaded"] is True
    layers = client.get("/api/v1/layers")
    sites = client.get("/api/v1/sites")
    assert layers.status_code == sites.status_code == 200
    assert len(sites.json()["sites"][0]["stops"]) == 6
    start = point(10, 10, "start")
    far = point(meta["height"] - 11, meta["width"] - 11, "far")
    payload = {
        "start": start,
        "stops": [{**(far if i % 2 == 0 else start), "id": f"stop-{i}"} for i in range(5)],
        "constraints": {"max_slope_deg": 15},
        "compare": True,
    }
    started = perf_counter()
    response = client.post("/api/v1/route", json=payload)
    elapsed = perf_counter() - started
    assert response.status_code == 200, response.text
    assert elapsed < 3, elapsed
    route = response.json()
    assert route["max_slope_deg"] <= 15
    assert route["alternative"] is None
    payload["start"]["lon"] = 0
    assert client.post("/api/v1/route", json=payload).status_code == 422
    (bundle.parent / "verified-route.json").write_text(response.text, encoding="utf-8")
    (bundle.parent / "verified-layers.json").write_text(layers.text, encoding="utf-8")
    print(
        json.dumps(
            {
                "python": sys.version.split()[0],
                "bundle": str(bundle),
                "layers": layers.status_code,
                "sites": sites.status_code,
                "route": response.status_code,
                "five_leg_seconds": round(elapsed, 3),
                "distance_m": round(route["distance_m"], 2),
                "max_slope_deg": route["max_slope_deg"],
            },
            indent=2,
        )
    )
