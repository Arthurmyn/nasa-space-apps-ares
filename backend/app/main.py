from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, planner, space_weather
from app.core.config import settings
from app.services.donki import AdvisoryCache
from app.services.grid import DATA_ROOT, default_site_id, load_grids
from app.services.load import RouteGuard


def create_app(data_dir=DATA_ROOT, donki_cache=None, route_guard=None):
    """`data_dir` is the folder that holds one folder per site, or a single site folder."""

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        grids, error = load_grids(data_dir)
        default = default_site_id(grids)
        application.state.grids = grids
        application.state.grid_error = error
        # The default site, for code that predates several sites.
        application.state.grid = grids[default] if default else None
        application.state.donki = donki_cache or AdvisoryCache()
        # Created here, inside the event loop that serves the requests.
        application.state.route_guard = route_guard() if route_guard else RouteGuard()
        yield

    application = FastAPI(title="Ares API", version="0.3.0", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(health.router, prefix="/api/v1")
    application.include_router(planner.router, prefix="/api/v1")
    application.include_router(space_weather.router, prefix="/api/v1")
    return application


app = create_app()
