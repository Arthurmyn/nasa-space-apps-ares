from fastapi import APIRouter, HTTPException

from app.schemas.predict import PredictRequest, PredictResponse
from app.services.ml import model_service

router = APIRouter(tags=["predict"])


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    if not model_service.loaded:
        raise HTTPException(status_code=503, detail="Model is not loaded")
    return PredictResponse(**model_service.predict(req.features))
