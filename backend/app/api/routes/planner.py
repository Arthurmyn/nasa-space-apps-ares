from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.schemas.route import LayersResponse, RouteRequest, RouteResponse, SitesResponse
from app.services.grid import Grid
from app.services.routing import route

router = APIRouter(tags=["planner"])


def get_grid(request: Request) -> Grid:
    if request.app.state.grid is None:
        raise HTTPException(status_code=503, detail=request.app.state.grid_error)
    return request.app.state.grid


GridDependency = Annotated[Grid, Depends(get_grid)]


@router.get("/layers", response_model=LayersResponse)
def layers(grid: GridDependency):
    source = "; ".join(grid.meta["sources"])
    return {
        "supports_alternatives": False,
        "layers": [
            {
                "id": id,
                "available": id in ("slope", "optical"),
                "reason": None if id in ("slope", "optical") else "No data for this site",
                "source": source if id in ("slope", "optical") else None,
            }
            for id in ("slope", "optical", "thermal", "geology", "radiation")
        ],
    }


@router.get("/sites", response_model=SitesResponse)
def sites(grid: GridDependency):
    return {"sites": [grid.site]}


@router.post("/route", response_model=RouteResponse)
def plan_route(body: RouteRequest, grid: GridDependency):
    try:
        return route(grid, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
