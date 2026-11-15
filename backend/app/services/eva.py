"""Return check: the longest walk back to the start from any point of the route.

For every route vertex: if the walk had to be abandoned here, how far is the
shortest walkable way back to the start? The walk back uses the same terrain
mask as the route (valid cells, slope at or below the route's hard limit, no
diagonal squeeze between blocked cells), but costs plain metres: the fastest
way home, not the gentlest.
"""

from heapq import heappop, heappush
from math import hypot, inf, sqrt

from app.schemas.route import ReturnCheck


def walk_back_field(grid, start: int, blocked: list[bool], targets: set[int]) -> dict[int, float]:
    """Shortest walkable distance in metres from the start cell to each target cell.

    Dijkstra stops as soon as every target is settled, so the search only covers
    the area the route actually reaches.
    """
    width, height, cell = grid.width, grid.height, grid.cell
    diagonal = sqrt(2) * cell
    moves = [
        (dy, dx, diagonal if dy and dx else cell)
        for dy in (-1, 0, 1)
        for dx in (-1, 0, 1)
        if dy or dx
    ]
    best = {start: 0.0}
    found: dict[int, float] = {}
    remaining = set(targets)
    queue = [(0.0, start)]
    while queue and remaining:
        cost, index = heappop(queue)
        if cost > best.get(index, inf):
            continue
        if index in remaining:
            found[index] = cost
            remaining.discard(index)
        row, col = divmod(index, width)
        for dy, dx, length in moves:
            nr, nc = row + dy, col + dx
            if not (0 <= nr < height and 0 <= nc < width):
                continue
            nxt = nr * width + nc
            if blocked[nxt]:
                continue
            if dy and dx and (blocked[row * width + nc] or blocked[nr * width + col]):
                continue
            candidate = cost + length
            if candidate < best.get(nxt, inf):
                best[nxt] = candidate
                heappush(queue, (candidate, nxt))
    return found


def return_check(grid, limit: float, start_xy, start_index: int, vertices) -> ReturnCheck | None:
    """The route vertex with the longest shortest walk back, against the site's return limit.

    vertices: (cell index, x, y, distance along route) for every route vertex.
    Returns None when the site sets no return limit.
    """
    if grid.return_limit_m is None and grid.return_limit_s is None:
        return None
    blocked = (~grid.valid | (grid.slope > limit)).tolist()
    field = walk_back_field(grid, start_index, blocked, {v[0] for v in vertices})
    sx, sy = grid.center_xy(start_index)
    start_link = hypot(start_xy[0] - sx, start_xy[1] - sy)

    def back(vertex):
        index, x, y, _ = vertex
        cx, cy = grid.center_xy(index)
        # The route reached this cell, so the field has it; inf is only a guard.
        return field.get(index, inf) + hypot(x - cx, y - cy) + start_link

    returns = [back(v) for v in vertices]
    worst = max(range(len(vertices)), key=returns.__getitem__)
    worst_m = returns[worst]
    worst_s = worst_m / (grid.speed / 3.6)
    ok = (grid.return_limit_m is None or worst_m <= grid.return_limit_m) and (
        grid.return_limit_s is None or worst_s <= grid.return_limit_s
    )
    return ReturnCheck(
        ok=ok,
        worst_return_m=worst_m,
        worst_return_s=worst_s,
        worst_point=grid.lonlat(vertices[worst][1], vertices[worst][2]),
        worst_route_dist_m=vertices[worst][3],
        limit_m=grid.return_limit_m,
        limit_s=grid.return_limit_s,
    )
