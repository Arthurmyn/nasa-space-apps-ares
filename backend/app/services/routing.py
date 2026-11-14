"""Eight-neighbour A* with an admissible octile-distance heuristic."""

from datetime import datetime, timezone
from heapq import heappop, heappush
from math import hypot, inf, sqrt

from app.schemas.route import Assumption, ProfilePoint, RouteRequest, RouteResponse, RouteStop
from app.services.grid import Grid
from app.services.hazards import hazard_zones


def astar(grid: Grid, start: int, goal: int, weights: list[float]):
    # Lengths are in cells: multiplying every cost and heuristic by the constant
    # cell_m gives metre costs and preserves exactly the same optimal path.
    width, height = grid.width, grid.height
    goal_row, goal_col = divmod(goal, width)
    diagonal = sqrt(2)

    def heuristic(row, col):
        dy, dx = abs(goal_row - row), abs(goal_col - col)
        return max(dx, dy) + (diagonal - 1) * min(dx, dy)

    best = [inf] * len(weights)
    parent = [-1] * len(weights)
    best[start] = 0
    queue = [(heuristic(*divmod(start, width)), 0.0, start)]
    moves = [
        (dy, dx, diagonal if dy and dx else 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx
    ]
    while queue:
        _, cost, index = heappop(queue)
        if cost != best[index]:
            continue
        if index == goal:
            path = [goal]
            while path[-1] != start:
                path.append(parent[path[-1]])
            return path[::-1]
        row, col = divmod(index, width)
        for dy, dx, length in moves:
            nr, nc = row + dy, col + dx
            if not (0 <= nr < height and 0 <= nc < width):
                continue
            nxt = nr * width + nc
            if weights[nxt] == inf:
                continue
            # Do not squeeze diagonally between impassable cells.
            if dy and dx and (weights[row * width + nc] == inf or weights[nr * width + col] == inf):
                continue
            candidate = cost + length * weights[nxt]
            if candidate < best[nxt]:
                best[nxt], parent[nxt] = candidate, index
                heappush(queue, (candidate + heuristic(nr, nc), candidate, nxt))
    return None


def route(grid: Grid, request: RouteRequest):
    limit = min(grid.limit, request.constraints.max_slope_deg)
    points = [request.start, *request.stops]
    indices = [grid.cell_index(p) for p in points]
    for point, index in zip(points, indices, strict=True):
        if grid.slope[index] > limit:
            raise ValueError(f"Point '{point.id}' exceeds the {limit:g} degree slope limit.")
    weights = 1 + (grid.slope / limit) ** 2
    weights[~grid.valid | (grid.slope > limit)] = inf
    weights = weights.tolist()
    geometry, samples, stops = [], [], []
    heading_segments = []
    distance, maximum = 0.0, 0.0
    boundaries = {0}
    previous_xy = None

    def append(xy, index):
        nonlocal distance, maximum, previous_xy
        maximum = max(maximum, float(grid.slope[index]))
        if previous_xy is not None:
            step = hypot(xy[0] - previous_xy[0], xy[1] - previous_xy[1])
            if step < 1e-9:
                return None
            distance += step
            heading_segments.append(len(geometry) - 1)
        geometry.append(grid.lonlat(*xy))
        samples.append(
            ProfilePoint(
                dist_m=distance,
                elev_m=float(grid.elevation[index]),
                slope_deg=float(grid.slope[index]),
            )
        )
        previous_xy = xy
        return len(geometry) - 2 if len(geometry) > 1 else None

    append(grid.xy(points[0].lon, points[0].lat), indices[0])
    for segment, (start, goal) in enumerate(zip(indices[:-1], indices[1:], strict=True)):
        path = astar(grid, start, goal, weights)
        if path is None:
            raise ValueError(
                f"No route from '{points[segment].id}' to '{points[segment + 1].id}': "
                f"terrain is disconnected by no-data cells or slopes above {limit:g} degrees."
            )
        departure = None
        grid_edges = []
        if start != goal:
            for i, index in enumerate(path):
                edge = append(grid.center_xy(index), index)
                if i == 0:
                    departure = edge
                elif edge is not None:
                    grid_edges.append(edge)
        point = points[segment + 1]
        arrival = append(grid.xy(point.lon, point.lat), goal)
        if grid_edges:
            # These edges are known click-to-cell connectors, irrespective of cell_m.
            # Their heading belongs to this leg's first/last actual A* movement.
            if departure is not None:
                heading_segments[departure] = grid_edges[0]
            if arrival is not None:
                heading_segments[arrival] = grid_edges[-1]
        boundaries.add(len(samples) - 1)
        # Client ids are arbitrary: enrich only a catalog stop at this position.
        catalog = next(
            (
                s
                for s in grid.site.stops
                if abs(s.lon - point.lon) < 1e-8 and abs(s.lat - point.lat) < 1e-8
            ),
            None,
        )
        stops.append(
            RouteStop(
                id=point.id,
                name=point.name,
                lon=point.lon,
                lat=point.lat,
                dist_m=distance,
                note=catalog.note if catalog else None,
                image=catalog.image if catalog else None,
            )
        )
    if len(geometry) == 1:
        geometry.append(geometry[0])
        heading_segments.append(0)
    vertex_dist_m = [sample.dist_m for sample in samples]
    if len(vertex_dist_m) == 1:
        vertex_dist_m.append(0.0)
    # Preserve stop boundaries and the steepest sample in each ~20m bucket of each leg.
    # This keeps Card's per-leg maxima consistent with the full-resolution route maximum.
    keep = set(boundaries)
    ordered = sorted(boundaries)
    for first, last in zip(ordered[:-1], ordered[1:], strict=True):
        bucket_start = first
        peak = first
        for i in range(first + 1, last + 1):
            if samples[i].slope_deg > samples[peak].slope_deg:
                peak = i
            if samples[i].dist_m - samples[bucket_start].dist_m >= 20 or i == last:
                keep.update((peak, i))
                bucket_start = peak = i
    profile = [samples[i] for i in sorted(keep)]
    safety = "ok" if maximum <= grid.caution else "caution"
    reason = (
        f"Maximum slope {maximum:g} degrees is within the {limit:g} degree route limit "
        f"and does not exceed the {grid.caution:g} degree caution threshold."
        if safety == "ok"
        else f"Maximum slope {maximum:g} degrees exceeds the "
        f"{grid.caution:g} degree caution threshold and is within the "
        f"{limit:g} degree route limit."
    )
    assumptions = [
        *grid.items,
        Assumption(
            name="Effective route slope limit",
            value=f"{limit:g} deg",
            source=(
                f"min(requested {request.constraints.max_slope_deg:g} deg, "
                f"site limit {grid.limit:g} deg from assumptions.json)"
            ),
        ),
    ]
    return RouteResponse(
        # timezone.utc keeps the backend compatible with local Python 3.10.
        computed_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),  # noqa: UP017
        distance_m=distance,
        max_slope_deg=maximum,
        est_time_s=distance / (grid.speed / 3.6),
        safety=safety,
        safety_reason=reason,
        polyline=geometry,
        stops=stops,
        profile=profile,
        assumptions=assumptions,
        hazards=hazard_zones(grid, limit, geometry),
        alternative=None,
        navigation={"vertex_dist_m": vertex_dist_m, "heading_segments": heading_segments},
        supports_alternatives=False,
    )
