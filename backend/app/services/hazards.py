"""Hazard zones: connected regions of cells too steep to cross, as lon/lat polygons.

A cell is impassable when its slope is above the effective route slope limit (the same rule
the router uses). Regions are the 4-connected groups of such cells. Small ones are dropped and
at most ``MAX_ZONES`` are returned, the ones nearest to the route first. Only numpy is used,
so the backend needs no extra dependency.
"""

from __future__ import annotations

import threading
from collections import OrderedDict, defaultdict
from dataclasses import dataclass
from weakref import WeakKeyDictionary

import numpy as np

from app.schemas.route import GeoJsonPolygon, HazardZone
from app.services.grid import Grid

MIN_CELLS = 10
MAX_ZONES = 8
# Outline simplification, in cells. It is halved until no route point lies inside a zone.
SIMPLIFY_CELLS = 1.0
COORD_DIGITS = 7
# Steep-region sets kept per grid. The planner uses two limits (the site limit and the caution
# threshold), so a few entries cover normal use while keeping memory bounded.
CACHE_ENTRIES = 4
# Largest (cells x route points) distance matrix built at once when ranking regions.
GAP_BLOCK = 1_000_000

Vertex = tuple[int, int]  # (column edge, row edge) of the cell lattice; row edges grow southwards


@dataclass(frozen=True)
class Region:
    cells: np.ndarray  # flat cell indices, sorted, int32
    width: int

    @property
    def rows(self) -> np.ndarray:
        return self.cells // self.width

    @property
    def cols(self) -> np.ndarray:
        return self.cells % self.width


_cache: WeakKeyDictionary[Grid, OrderedDict[int, list[Region]]] = WeakKeyDictionary()
_cache_lock = threading.Lock()


def mask_key(grid: Grid, limit: float) -> int:
    """How many distinct slope values of the grid are at or below ``limit``.

    Slopes are stored in steps of ``slope_unit_deg``, so every limit between two stored values
    gives the same steep mask. Caching by this count instead of the float limit keeps the result
    exact while the number of possible keys stays small (at most 256).
    """
    return int(np.searchsorted(grid.slope_levels, limit, side="right"))


def steep_regions(grid: Grid, limit: float) -> list[Region]:
    """Regions of at least MIN_CELLS cells steeper than ``limit``; a few kept per grid (LRU)."""
    key = mask_key(grid, limit)
    with _cache_lock:
        per_grid = _cache.setdefault(grid, OrderedDict())
        if key in per_grid:
            per_grid.move_to_end(key)
            return per_grid[key]

    regions = _find_regions(grid, limit)
    with _cache_lock:
        per_grid[key] = regions
        per_grid.move_to_end(key)
        while len(per_grid) > CACHE_ENTRIES:
            per_grid.popitem(last=False)
    return regions


def _find_regions(grid: Grid, limit: float) -> list[Region]:
    width, height = grid.width, grid.height
    mask = (grid.valid & (grid.slope > limit)).tolist()
    seen = bytearray(width * height)
    regions: list[Region] = []
    for seed in range(width * height):
        if not mask[seed] or seen[seed]:
            continue
        seen[seed] = 1
        stack, members = [seed], []
        while stack:
            index = stack.pop()
            members.append(index)
            row, col = divmod(index, width)
            for nr, nc in ((row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)):
                if 0 <= nr < height and 0 <= nc < width:
                    nxt = nr * width + nc
                    if mask[nxt] and not seen[nxt]:
                        seen[nxt] = 1
                        stack.append(nxt)
        if len(members) >= MIN_CELLS:
            cells = np.array(members, dtype=np.int32)
            cells.sort()
            cells.flags.writeable = False
            regions.append(Region(cells, width))
    return regions


def _boundary_rings(region: Region, width: int) -> list[list[Vertex]]:
    """Closed outlines of a region on the cell lattice: the outer ring and any holes."""
    members = set(region.cells.tolist())
    edges: dict[Vertex, list[Vertex]] = defaultdict(list)
    for index in region.cells.tolist():
        row, col = divmod(index, width)
        # Each side with no region cell behind it, directed with the region on its right.
        if row == 0 or index - width not in members:
            edges[(col, row)].append((col + 1, row))
        if col == width - 1 or index + 1 not in members:
            edges[(col + 1, row)].append((col + 1, row + 1))
        if index + width not in members:
            edges[(col + 1, row + 1)].append((col, row + 1))
        if col == 0 or index - 1 not in members:
            edges[(col, row + 1)].append((col, row))

    rings: list[list[Vertex]] = []
    while edges:
        start = next(iter(edges))
        ring = [start]
        previous, current = None, start
        while True:
            options = edges[current]
            if len(options) == 1 or previous is None:
                target = options[0]
            else:
                target = _rightmost(previous, current, options)
            options.remove(target)
            if not options:
                del edges[current]
            previous, current = current, target
            if current == start:
                break
            ring.append(current)
        rings.append(ring)
    return rings


def _rightmost(previous: Vertex, current: Vertex, options: list[Vertex]) -> Vertex:
    """At a vertex where two outlines touch, turn right (towards the region): rings stay simple."""
    dx, dy = current[0] - previous[0], current[1] - previous[1]
    right = (-dy, dx)  # on screen (row axis down), a right turn from heading (dx, dy)

    def rank(option: Vertex) -> int:
        ox, oy = option[0] - current[0], option[1] - current[1]
        if (ox, oy) == right:
            return 0
        if (ox, oy) == (dx, dy):
            return 1
        return 2

    return min(options, key=rank)


def _signed_area(ring: list[Vertex]) -> float:
    total = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1], strict=True):
        total += x1 * y2 - x2 * y1
    return total / 2


def _simplify(ring: list[Vertex], tolerance: float) -> list[Vertex]:
    """Douglas-Peucker on a closed ring, split at the two points farthest apart."""
    if tolerance <= 0 or len(ring) <= 4:
        return ring
    pts = np.array(ring, dtype=float)
    first = 0
    last = int(np.argmax(np.hypot(*(pts - pts[first]).T)))
    keep = {first, last}

    def recurse(lo: int, hi: int, indices: list[int]) -> None:
        if hi - lo < 2:
            return
        a, b = pts[indices[lo]], pts[indices[hi]]
        seg = b - a
        length = float(np.hypot(*seg)) or 1.0
        inner = pts[[indices[k] for k in range(lo + 1, hi)]]
        dist = np.abs(seg[0] * (a[1] - inner[:, 1]) - seg[1] * (a[0] - inner[:, 0])) / length
        k = int(np.argmax(dist))
        if dist[k] > tolerance:
            mid = lo + 1 + k
            keep.add(indices[mid])
            recurse(lo, mid, indices)
            recurse(mid, hi, indices)

    n = len(ring)
    one = [(first + i) % n for i in range(((last - first) % n) + 1)]
    two = [(last + i) % n for i in range(((first - last) % n) + 1)]
    recurse(0, len(one) - 1, one)
    recurse(0, len(two) - 1, two)
    return [ring[i] for i in range(n) if i in keep]


def _inside(ring: list[tuple[float, float]], x: float, y: float) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1], strict=True):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _contains(polygon: list[list[Vertex]], x: float, y: float) -> bool:
    """Even-odd test: inside the outer ring and outside every hole."""
    count = sum(_inside(ring, x, y) for ring in polygon)  # type: ignore[arg-type]
    return count % 2 == 1


def hazard_zones(
    grid: Grid, limit: float, route_lonlat: list[tuple[float, float]]
) -> list[HazardZone]:
    """Hazard zones for a route: the steep regions nearest to it, as closed lon/lat polygons."""
    regions = steep_regions(grid, limit)
    if not regions:
        return []

    # Route points on the cell lattice, where the centre of cell (r, c) is (c + 0.5, r + 0.5).
    route = []
    for lon, lat in route_lonlat:
        x, y = grid.xy(lon, lat)
        route.append(((x - grid.x_min) / grid.cell, (grid.y_max - y) / grid.cell))
    route_xy = np.array(route, dtype=float)

    def gap(region: Region) -> float:
        # Squared distance from the nearest cell centre to the nearest route point. The route is
        # taken in chunks so a large region against a long route never builds a huge matrix.
        cx, cy = region.cols + 0.5, region.rows + 0.5
        step = max(1, GAP_BLOCK // len(cx))
        best = np.inf
        for i in range(0, len(route_xy), step):
            part = route_xy[i : i + step]
            d = (cx[:, None] - part[None, :, 0]) ** 2 + (cy[:, None] - part[None, :, 1]) ** 2
            best = min(best, float(d.min()))
        return best

    ranked = sorted(regions, key=lambda r: (gap(r), -len(r.cells)))[:MAX_ZONES]

    zones: list[HazardZone] = []
    for number, region in enumerate(ranked, start=1):
        rings = _boundary_rings(region, grid.width)
        outer = max(rings, key=lambda r: abs(_signed_area(r)))
        sign = _signed_area(outer) > 0
        holes = [r for r in rings if r is not outer and (_signed_area(r) > 0) != sign]
        polygon = _fit_polygon([outer, *holes], route_xy)
        zones.append(
            HazardZone(
                id=f"hazard-{number}",
                kind="steep_slope",
                label=f"Slope over {limit:g} deg",
                polygon=GeoJsonPolygon(
                    type="Polygon",
                    coordinates=[_to_lonlat(grid, ring) for ring in polygon],
                ),
            )
        )
    return zones


def _fit_polygon(rings: list[list[Vertex]], route_xy: np.ndarray) -> list[list[Vertex]]:
    """Simplify the outlines, tightening until no route point falls inside the zone."""
    tolerance = SIMPLIFY_CELLS
    while True:
        polygon = [_simplify(ring, tolerance) for ring in rings]
        if tolerance == 0 or not any(_contains(polygon, float(x), float(y)) for x, y in route_xy):
            return polygon
        tolerance = tolerance / 2 if tolerance > 0.1 else 0


def _to_lonlat(grid: Grid, ring: list[Vertex]) -> list[tuple[float, float]]:
    """Lattice vertices to lon/lat as a closed ring, converted like the route polyline."""
    box = grid.meta.get("bbox")
    coords = []
    for col, row in ring:
        lon, lat = grid.lonlat(grid.x_min + col * grid.cell, grid.y_max - row * grid.cell)
        lon, lat = round(lon, COORD_DIGITS), round(lat, COORD_DIGITS)
        if box:
            # Rounding must not push an edge vertex a hair outside the site's bounding box.
            lon = min(max(lon, box["lon_min"]), box["lon_max"])
            lat = min(max(lat, box["lat_min"]), box["lat_max"])
        coords.append((lon, lat))
    coords.append(coords[0])
    return coords
