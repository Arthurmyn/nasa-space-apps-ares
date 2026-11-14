from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, planner
from app.core.config import settings
from app.services.grid import DATA_DIR, load_grid


def create_app(data_dir=DATA_DIR):
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.grid, application.state.grid_error = load_grid(data_dir)
        yield

    application = FastAPI(title="Ares API", version="0.2.0", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(health.router, prefix="/api/v1")
    application.include_router(planner.router, prefix="/api/v1")
    return application


app = create_app()
