"""Time POST /api/v1/route on a site and measure the backend's memory.

Two cases, both through the real FastAPI app (TestClient, no network), so the numbers include request
parsing, A*, the return check, hazard zones and the response:

  boxwork   the start and the first five stops of the "Boxwork" group, nearest first (what the Plan view
            sends when a person picks the group)
  longest   a start and a stop at the two passable cells that are farthest apart (a stress case: it
            crosses the whole area; the longest shortest path may be a little longer)

Each case runs --runs times; the median and the worst are printed, with the grid size, the load time
and the process's peak memory (resident set size) after loading and after the routes.

    python -m scripts.bench_route --site gale-bx
"""

import argparse
import math
import resource
import statistics
import sys
import time
from itertools import combinations
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402
from app.services.grid import DATA_ROOT, load_grids  # noqa: E402


def peak_rss_mb() -> float:
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak / (1024 * 1024) if sys.platform == "darwin" else peak / 1024  # bytes on macOS, KiB on Linux


def point(pid, lon, lat, name=None):
    return {"id": pid, "lon": lon, "lat": lat, **({"name": name} if name else {})}


def passable_component(grid):
    """Indices of the passable cells (valid, slope within the limit) of the largest 8-connected region."""
    from scipy.ndimage import label

    ok = (grid.valid & (grid.slope <= grid.limit)).reshape(grid.height, grid.width)
    labels, count = label(ok, structure=np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())[1:]
    biggest = 1 + int(np.argmax(sizes))
    rows, cols = np.nonzero(labels == biggest)
    return rows, cols


def farthest_pair(grid):
    """Two cells of the largest passable region that are farthest apart in a straight line (picked from its extremes)."""
    rows, cols = passable_component(grid)
    keys = {
        "nw": -(rows + cols), "se": rows + cols, "ne": cols - rows, "sw": rows - cols,
        "n": -rows, "s": rows, "w": -cols, "e": cols,
    }
    cells = {}
    for name, key in keys.items():
        i = int(np.argmax(key))
        cells[name] = (int(rows[i]), int(cols[i]))
    best, pair = -1.0, None
    for a, b in combinations(cells.values(), 2):
        d = math.hypot(a[0] - b[0], a[1] - b[1])
        if d > best:
            best, pair = d, (a, b)
    return pair, best * grid.cell


def cell_lonlat(grid, row, col):
    x, y = grid.center_xy(row * grid.width + col)
    return grid.lonlat(x, y)


def nearest_first(start, stops):
    left, order, here = list(stops), [], start
    while left:
        nxt = min(left, key=lambda s: math.hypot(s["lon"] - here[0], s["lat"] - here[1]))
        left.remove(nxt)
        order.append(nxt)
        here = (nxt["lon"], nxt["lat"])
    return order


def time_requests(client, body, runs):
    times, last = [], None
    for _ in range(runs):
        t = time.perf_counter()
        last = client.post("/api/v1/route", json=body)
        times.append(time.perf_counter() - t)
    return times, last


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--site", default="gale-bx")
    parser.add_argument("--data-root", type=Path, default=DATA_ROOT)
    parser.add_argument("--runs", type=int, default=3)
    args = parser.parse_args(argv)

    t = time.perf_counter()
    grids, _ = load_grids(args.data_root)
    load_s = time.perf_counter() - t
    grid = grids[args.site]
    rss_loaded = peak_rss_mb()
    print(f"site {args.site}: {grid.width} x {grid.height} cells of {grid.cell:g} m = {grid.width * grid.height:,} cells, "
          f"{grid.width * grid.cell / 1000:.2f} x {grid.height * grid.cell / 1000:.2f} km")
    print(f"load all sites: {load_s:.2f} s; peak memory after loading: {rss_loaded:.0f} MB")

    group = next((g for g in grid.site.groups if g.id == "boxwork"), None)
    stops = [s for s in grid.site.stops if group and s.id in group.stop_ids]
    start = (grid.lon0, grid.lat0)
    ordered = nearest_first(start, [{"lon": s.lon, "lat": s.lat, "name": s.name} for s in stops])[:5]
    (a, b), straight = farthest_pair(grid)
    cases = {
        "boxwork": {"start": point("start", *start), "stops": [point(f"stop-{i + 1}", s["lon"], s["lat"], s["name"]) for i, s in enumerate(ordered)]},
        "longest": {"start": point("start", *cell_lonlat(grid, *a)), "stops": [point("stop-1", *cell_lonlat(grid, *b))]},
    }
    app = create_app(args.data_root)
    with TestClient(app) as client:
        for name, case in cases.items():
            body = {"site_id": args.site, **case, "constraints": {"max_slope_deg": 15}}
            times, last = time_requests(client, body, args.runs)
            if last.status_code != 200:
                print(f"{name}: HTTP {last.status_code}: {last.json().get('detail')}")
                continue
            data = last.json()
            print(f"{name}: {len(case['stops'])} stop(s), {data['distance_m'] / 1000:.2f} km, "
                  f"median {statistics.median(times):.2f} s, worst {max(times):.2f} s over {args.runs} runs")
        print(f"(longest: straight line between the two cells {straight / 1000:.2f} km apart)")
    print(f"peak memory after the routes: {peak_rss_mb():.0f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
