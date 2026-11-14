from pydantic import BaseModel


class PredictRequest(BaseModel):
    features: dict[str, float]


class PredictResponse(BaseModel):
    prediction: int | float | str
    confidence: float | None = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
