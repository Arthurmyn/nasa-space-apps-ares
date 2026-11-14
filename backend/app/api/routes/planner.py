import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.schemas.route import LayersResponse, RouteRequest, RouteResponse, SitesResponse
from app.services.grid import Grid
from app.services.routing import route

router = APIRouter(tags=["planner"])
logger = logging.getLogger(__name__)


def get_grid(request: Request) -> Grid:
    if request.app.state.grid is None:
        raise HTTPException(status_code=503, detail=request.app.state.grid_error)
    return request.app.state.grid


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
def sites(grid: GridDependency):
    return {"sites": [grid.site]}


@router.post("/route", response_model=RouteResponse)
def plan_route(body: RouteRequest, grid: GridDependency):
    try:
        return route(grid, body)
    except ValueError as exc:
        # Logged so a failed route on the server can be told apart (outside grid, unreachable, ...).
        # Warning level: uvicorn does not set up INFO for application loggers.
        logger.warning("Route rejected: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
