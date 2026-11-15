import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from app.schemas.route import (
    LayersResponse,
    RouteRequest,
    RouteResponse,
    SensitivityResponse,
    SitesResponse,
)
from app.services.conditions import get_conditions
from app.services.geology import unit_at
from app.services.grid import Grid
from app.services.routing import route, sensitivity

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


def no_go(detail: str) -> JSONResponse:
    """422 with the reason; `status` and `reasons` say the same as a route response would."""
    return JSONResponse(
        status_code=422,
        content={
            "detail": detail,
            "status": "NO-GO",
            "reasons": [detail],
            "readiness": {"level": "NOT_ADVISED", "reasons": [detail]},
        },
    )


@router.post("/route", response_model=RouteResponse, responses={422: {"description": "No route"}})
def plan_route(body: RouteRequest, request: Request):
    grid = resolve_grid(request, body.site_id)
    try:
        return route(grid, body)
    except ValueError as exc:
        return no_go(str(exc))


@router.post("/route/sensitivity", response_model=SensitivityResponse)
def route_sensitivity(body: RouteRequest, request: Request):
    """The same stops with hard slope limits of 10, 15 and 20 degrees: the cost, or why it fails."""
    grid = resolve_grid(request, body.site_id)
    try:
        # Points outside the grid or on no-data cells fail for every limit: report that as 422.
        for point in (body.start, *body.stops):
            grid.cell_index(point)
    except ValueError as exc:
        return no_go(str(exc))
    return {"site_id": grid.site.id, "results": sensitivity(grid, body)}


@router.get("/conditions")
def conditions():
    """Curiosity REMS weather, cached an hour. Always 200; {"available": false} on failure."""
    return get_conditions()


@router.get("/geology")
def geology(
    grid: GridDependency,
    lon: Annotated[float, Query(ge=-180, le=180, allow_inf_nan=False)],
    lat: Annotated[float, Query(ge=-90, le=90, allow_inf_nan=False)],
):
    """The geologic unit (USGS SIM 3292) at a point of the site. Always 200 for a valid query."""
    doc = grid.geology
    if doc is None:
        return {"available": False, "reason": "No geology data for this site"}
    info = doc["ares"]
    box = info["bbox"]
    if not (box["lon_min"] <= lon <= box["lon_max"] and box["lat_min"] <= lat <= box["lat_max"]):
        return {
            "available": False,
            "reason": "The point is outside the area covered by this site's geology data",
        }
    found = unit_at(doc, lon, lat)
    if found is None:
        return {"available": False, "reason": "No mapped unit at this point"}
    return {
        "available": True,
        "site_id": info["site_id"],
        **found,
        "scale": info["scale"],
        "units_in_site": len({f["properties"]["unit"] for f in doc["features"]}),
        "source": {k: info["source"][k] for k in ("title", "url", "citation")},
        "note": info["note"],
    }


@router.get("/validation")
def validation(grid: GridDependency):
    """Our elevation against Curiosity's measured traverse, from validation.json. Always 200."""
    return grid.validation
