"""Eight-neighbour A* with an admissible octile-distance heuristic."""

from datetime import datetime, timezone
from heapq import heappop, heappush
from math import hypot, inf, sqrt

from app.schemas.route import (
    Assumption,
    ProfilePoint,
    ReturnCheck,
    ReturnTrip,
    RouteRequest,
    RouteResponse,
    RouteStats,
    RouteStop,
    SlopeClassPct,
)
from app.services.eva import return_check
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


# Cost of stepping onto a cell is length * (1 + k * (slope / limit)^2). "balanced" is the original
# cost (k = 1); "fast" is less afraid of slopes (k = 0.5); "safe" keeps balanced costs but uses the
# caution threshold as the hard limit.
COST_FACTOR = {"fast": 0.5, "balanced": 1.0, "safe": 1.0}


class Plan:
    """The geometry and measurements of one planned path through a list of points."""

    def __init__(self):
        self.geometry: list[tuple[float, float]] = []
        self.samples: list[ProfilePoint] = []
        self.stops: list[RouteStop] = []
        self.heading_segments: list[int] = []
        self.distance = 0.0
        self.maximum = 0.0
        self.boundaries: set[int] = {0}
        # (cell index, x, y, distance along the path) per vertex, for the return check.
        self.vertices: list[tuple[int, float, float, float]] = []


def cost_weights(grid: Grid, limit: float, profile: str) -> list[float]:
    weights = 1 + COST_FACTOR[profile] * (grid.slope / limit) ** 2
    weights[~grid.valid | (grid.slope > limit)] = inf
    return weights.tolist()


def plan_path(grid: Grid, points, limit: float, profile: str) -> Plan:
    """A* through `points` in order. Raises ValueError with a readable reason if no path exists."""
    indices = [grid.cell_index(p) for p in points]
    for point, index in zip(points, indices, strict=True):
        if grid.slope[index] > limit:
            raise ValueError(f"Point '{point.id}' exceeds the {limit:g} degree slope limit.")
    weights = cost_weights(grid, limit, profile)
    plan = Plan()
    geometry, samples, stops = plan.geometry, plan.samples, plan.stops
    heading_segments = plan.heading_segments
    boundaries = plan.boundaries
    previous_xy = None

    def append(xy, index):
        nonlocal previous_xy
        plan.maximum = max(plan.maximum, float(grid.slope[index]))
        if previous_xy is not None:
            step = hypot(xy[0] - previous_xy[0], xy[1] - previous_xy[1])
            if step < 1e-9:
                return None
            plan.distance += step
            heading_segments.append(len(geometry) - 1)
        geometry.append(grid.lonlat(*xy))
        plan.vertices.append((index, xy[0], xy[1], plan.distance))
        samples.append(
            ProfilePoint(
                dist_m=plan.distance,
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
                dist_m=plan.distance,
                note=catalog.note if catalog else None,
                image=catalog.image if catalog else None,
            )
        )
    return plan


def travel_time_s(grid: Grid, distance_m: float) -> float:
    return distance_m / (grid.speed / 3.6)


def route_stats(plan: Plan, caution: float, limit: float) -> RouteStats:
    """Share of the walk (by distance) in each slope class, and the total climb and descent."""
    shares = {"ok": 0.0, "caution": 0.0, "avoid": 0.0}
    climb = descent = 0.0
    for a, b in zip(plan.samples[:-1], plan.samples[1:], strict=True):
        step = b.dist_m - a.dist_m
        slope = max(a.slope_deg, b.slope_deg)
        shares["ok" if slope <= caution else "caution" if slope <= limit else "avoid"] += step
        dz = b.elev_m - a.elev_m
        climb += max(dz, 0.0)
        descent += max(-dz, 0.0)
    total = sum(shares.values())
    if total <= 0:
        pct = {"ok": 100.0, "caution": 0.0, "avoid": 0.0}
    else:
        pct = {k: round(100 * v / total, 1) for k, v in shares.items()}
        pct["ok"] = round(
            100.0 - pct["caution"] - pct["avoid"], 1
        )  # the three always add up to 100
    return RouteStats(slope_class_pct=SlopeClassPct(**pct), climb_m=climb, descent_m=descent)


def go_status(
    grid: Grid,
    maximum: float,
    round_trip_s: float | None,
    fallback: bool,
    limit: float,
    stops_s: float = 0.0,
    check: ReturnCheck | None = None,
) -> tuple[str, list[str]]:
    """GO, CAUTION or NO-GO with the reasons, from the route's own numbers."""
    reasons: list[str] = []
    status = "GO"
    eva = grid.eva_limit_s
    what = "EVA time (round trip + time at stops)" if stops_s > 0 else "Round trip"
    if round_trip_s is None:
        status = "NO-GO"
        reasons.append("No path back to the start along the same stops.")
    elif eva is not None and round_trip_s + stops_s > eva:
        status = "NO-GO"
        reasons.append(
            f"{what} {(round_trip_s + stops_s) / 3600:.1f} h exceeds the EVA time limit "
            f"{eva / 3600:.1f} h."
        )
    if check is not None and not check.ok:
        status = "NO-GO"
        limits = " / ".join(
            text
            for text in (
                f"{check.limit_m / 1000:g} km" if check.limit_m is not None else None,
                f"{check.limit_s / 60:g} min" if check.limit_s is not None else None,
            )
            if text
        )
        reasons.append(
            f"Walk back from {check.worst_route_dist_m:.0f} m along the route is "
            f"{check.worst_return_m / 1000:.2f} km, {check.worst_return_s / 60:.0f} min: "
            f"over the {limits} return limit."
        )
    if status != "NO-GO":
        if maximum > grid.caution:
            status = "CAUTION"
            reasons.append(
                f"Maximum slope {maximum:g} degrees is above the {grid.caution:g} degree "
                f"caution threshold (route limit {limit:g} degrees)."
            )
        if fallback:
            status = "CAUTION"
            reasons.append(
                f"The safe profile found no path under {grid.caution:g} degrees, "
                f"so the {limit:g} degree limit was used."
            )
    if status == "GO":
        reasons.append(
            f"Maximum slope {maximum:g} degrees is within the {grid.caution:g} degree "
            "caution threshold."
        )
        if eva is not None and round_trip_s is not None:
            reasons.append(
                f"{what} {(round_trip_s + stops_s) / 3600:.1f} h is within the EVA time limit "
                f"{eva / 3600:.1f} h."
            )
        if check is not None:
            reasons.append(
                f"Longest walk back to the start is {check.worst_return_m / 1000:.2f} km, "
                f"{check.worst_return_s / 60:.0f} min, within the return limit."
            )
    return status, reasons


def route(grid: Grid, request: RouteRequest, limit: float | None = None):
    effective = limit if limit is not None else min(grid.limit, request.constraints.max_slope_deg)
    profile = request.profile
    points = [request.start, *request.stops]

    fallback = False
    hard = effective
    if profile == "safe":
        hard = min(effective, grid.caution)
        try:
            plan = plan_path(grid, points, hard, profile)
        except ValueError:
            # Nothing passable under the caution threshold: use the normal limit and say so.
            fallback, hard = True, effective
            plan = plan_path(grid, points, effective, "balanced")
    else:
        plan = plan_path(grid, points, effective, profile)

    cost_profile = "balanced" if fallback else profile
    try:
        back = plan_path(grid, list(reversed(points)), hard, cost_profile)
        return_trip = ReturnTrip(
            distance_m=back.distance, est_time_s=travel_time_s(grid, back.distance)
        )
    except ValueError:
        return_trip = None

    geometry, samples = plan.geometry, plan.samples
    distance, maximum = plan.distance, plan.maximum
    heading_segments = plan.heading_segments
    boundaries = plan.boundaries
    stops = plan.stops
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
    profile_points = [samples[i] for i in sorted(keep)]
    safety = "ok" if maximum <= grid.caution else "caution"
    reason = (
        f"Maximum slope {maximum:g} degrees is within the {hard:g} degree route limit "
        f"and does not exceed the {grid.caution:g} degree caution threshold."
        if safety == "ok"
        else f"Maximum slope {maximum:g} degrees exceeds the "
        f"{grid.caution:g} degree caution threshold and is within the "
        f"{hard:g} degree route limit."
    )
    assumptions = [
        *grid.items,
        Assumption(
            name="Effective route slope limit",
            value=f"{effective:g} deg",
            source=(
                f"min(requested {request.constraints.max_slope_deg:g} deg, "
                f"site limit {grid.limit:g} deg from assumptions.json)"
            ),
        ),
    ]
    if profile != "balanced":
        assumptions.append(
            Assumption(
                name="Route profile",
                value=profile if not fallback else f"{profile} (fell back to balanced)",
                source=(
                    "fast: step cost length * (1 + 0.5 * (slope / limit)^2); "
                    f"safe: hard limit {min(effective, grid.caution):g} deg (the caution threshold)"
                ),
            )
        )
    est_time_s = travel_time_s(grid, distance)
    round_trip_s = est_time_s + return_trip.est_time_s if return_trip else None
    stops_s = request.stop_time_min * 60 * len(stops)
    check = return_check(
        grid, hard, grid.xy(points[0].lon, points[0].lat), grid.cell_index(points[0]), plan.vertices
    )
    if stops_s > 0:
        assumptions.append(
            Assumption(
                name="Time at each stop",
                value=f"{request.stop_time_min:g} min",
                source="Planning input set in ARES; not a NASA value.",
            )
        )
    status, reasons = go_status(grid, maximum, round_trip_s, fallback, hard, stops_s, check)
    return RouteResponse(
        # timezone.utc keeps the backend compatible with local Python 3.10.
        computed_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),  # noqa: UP017
        distance_m=distance,
        max_slope_deg=maximum,
        est_time_s=est_time_s,
        safety=safety,
        safety_reason=reason,
        polyline=geometry,
        stops=stops,
        profile=profile_points,
        assumptions=assumptions,
        hazards=hazard_zones(grid, hard, geometry),
        alternative=None,
        navigation={"vertex_dist_m": vertex_dist_m, "heading_segments": heading_segments},
        supports_alternatives=False,
        route_profile=profile,
        profile_fallback=fallback,
        stats=route_stats(plan, grid.caution, hard),
        return_trip=return_trip,
        round_trip_time_s=round_trip_s,
        eva_limit_s=grid.eva_limit_s,
        return_check=check,
        stops_time_s=stops_s,
        eva_time_s=round_trip_s + stops_s if round_trip_s is not None else None,
        status=status,
        reasons=reasons,
    )


def sensitivity(grid: Grid, request: RouteRequest, limits=(10.0, 15.0, 20.0)) -> list[dict]:
    """The same stops planned with several hard slope limits: the cost of each, or why it fails.

    The limits are used as given: this is an analysis, so 20 degrees is tried even though the site
    data caps real routes at its own limit. The cost profile is `fast` or `balanced`; `safe` has no
    meaning here, because the limit is what is being varied.
    """
    profile = "fast" if request.profile == "fast" else "balanced"
    points = [request.start, *request.stops]
    results = []
    for limit in limits:
        try:
            plan = plan_path(grid, points, limit, profile)
        except ValueError as exc:
            results.append(
                {
                    "limit_deg": limit,
                    "reachable": False,
                    "distance_m": None,
                    "est_time_s": None,
                    "max_slope_deg": None,
                    "reason": str(exc),
                }
            )
            continue
        results.append(
            {
                "limit_deg": limit,
                "reachable": True,
                "distance_m": plan.distance,
                "est_time_s": travel_time_s(grid, plan.distance),
                "max_slope_deg": plan.maximum,
                "reason": None,
            }
        )
    return results
