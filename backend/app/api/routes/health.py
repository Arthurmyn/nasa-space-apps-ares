from fastapi import APIRouter

from app.schemas.predict import HealthResponse
from app.services.ml import model_service

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", model_loaded=model_service.loaded)
