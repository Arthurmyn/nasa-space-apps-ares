from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
def health(request: Request):
    return {"status": "ok", "data_loaded": request.app.state.grid is not None}
