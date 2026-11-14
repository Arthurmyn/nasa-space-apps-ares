import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.schemas.route import LayersResponse, RouteRequest, RouteResponse, SitesResponse
from app.services.grid import Grid
from app.services.routing import route

router = APIRouter(tags=["planner"])
logger = logging.getLogger(__name__)


def resolve_grid(request: Request, site_id: str | None) -> Grid:
    """The grid of `site_id`, or of the default site when it is omitted."""
    state = request.app.state
    if not state.grids:
        raise HTTPException(status_code=503, detail=state.grid_error)
    if site_id is None:
        return state.grid
    grid = state.grids.get(site_id)
    if grid is None:
        raise HTTPException(status_code=404, detail=f"Unknown site '{site_id}'.")
    return grid


def get_grid(request: Request, site_id: Annotated[str | None, Query(max_length=64)] = None) -> Grid:
    return resolve_grid(request, site_id)


GridDependency = Annotated[Grid, Depends(get_grid)]


RADIATION_REASON = "Single value for the whole site, see route summary"
NO_DATA_REASON = "No data for this site"


def layer_entry(grid: Grid, id: str) -> dict:
    if id in ("slope", "optical"):
        return {
            "id": id,
            "available": True,
            "reason": None,
            "source": "; ".join(grid.meta["sources"]),
        }
    if id in grid.layers:
        source = grid.layers[id]["source"]
        return {
            "id": id,
            "available": True,
            "reason": None,
            "source": f"{source['title']}, {source['credit']}, {source['page_url']}",
        }
    # Radiation is one measured number for the whole site, not a map: shown in the route summary.
    reason = RADIATION_REASON if id == "radiation" else NO_DATA_REASON
    return {"id": id, "available": False, "reason": reason, "source": None}


@router.get("/layers", response_model=LayersResponse)
def layers(grid: GridDependency):
    ids = ("slope", "optical", "thermal", "geology", "radiation")
    return {"layers": [layer_entry(grid, id) for id in ids]}


@router.get("/sites", response_model=SitesResponse)
def sites(request: Request):
    state = request.app.state
    if not state.grids:
        raise HTTPException(status_code=503, detail=state.grid_error)
    # The default site first, then the others by id.
    ordered = [state.grid, *(g for sid, g in sorted(state.grids.items()) if g is not state.grid)]
    return {"sites": [g.site for g in ordered]}


@router.post("/route", response_model=RouteResponse)
def plan_route(body: RouteRequest, request: Request):
    grid = resolve_grid(request, body.site_id)
    try:
        return route(grid, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
