"""Eight-neighbour A* with an admissible octile-distance heuristic."""

from datetime import UTC, datetime
from heapq import heappop, heappush
from math import hypot, inf, sqrt

from app.schemas.route import ProfilePoint, RouteRequest, RouteResponse, RouteStop
from app.services.grid import Grid


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
    distance, maximum = 0.0, 0.0
    previous_xy = None

    def append(xy, index):
        nonlocal distance, maximum, previous_xy
        maximum = max(maximum, float(grid.slope[index]))
        if previous_xy is not None:
            step = hypot(xy[0] - previous_xy[0], xy[1] - previous_xy[1])
            if step < 1e-9:
                return
            distance += step
        geometry.append(grid.lonlat(*xy))
        samples.append(
            ProfilePoint(
                dist_m=distance,
                elev_m=float(grid.elevation[index]),
                slope_deg=float(grid.slope[index]),
            )
        )
        previous_xy = xy

    append(grid.xy(points[0].lon, points[0].lat), indices[0])
    for segment, (start, goal) in enumerate(zip(indices[:-1], indices[1:], strict=True)):
        path = astar(grid, start, goal, weights)
        if path is None:
            raise ValueError(
                f"No route from '{points[segment].id}' to '{points[segment + 1].id}': "
                f"terrain is disconnected by no-data cells or slopes above {limit:g} degrees."
            )
        if start != goal:
            for index in path:
                append(grid.center_xy(index), index)
        point = points[segment + 1]
        append(grid.xy(point.lon, point.lat), goal)
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
    # Keep every traversed cell for maximum/safety, sample the displayed profile ~20m apart.
    profile = [samples[0]]
    for sample in samples[1:-1]:
        if sample.dist_m - profile[-1].dist_m >= 20:
            profile.append(sample)
    if samples[-1].dist_m > profile[-1].dist_m:
        profile.append(samples[-1])
    safety = "ok" if maximum <= grid.caution else "caution"
    reason = (
        f"Maximum slope {maximum:g} degrees is within the "
        f"{grid.caution:g} degree caution threshold."
        if safety == "ok"
        else f"Maximum slope {maximum:g} degrees exceeds the "
        f"{grid.caution:g} degree caution threshold and is within the "
        f"{limit:g} degree route limit."
    )
    return RouteResponse(
        computed_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        distance_m=distance,
        max_slope_deg=maximum,
        est_time_s=distance / (grid.speed / 3.6),
        safety=safety,
        safety_reason=reason,
        polyline=geometry,
        stops=stops,
        profile=profile,
        assumptions=grid.items,
        hazards=[],
        alternative=None,
    )
