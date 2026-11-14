from fastapi import APIRouter, Request, Response

from app.services.donki import CACHE_S, RETRY_S, AdvisoryCache

router = APIRouter(tags=["space-weather"])


@router.get("/donki")
def donki(request: Request, response: Response):
    cache: AdvisoryCache = request.app.state.donki
    advisory = cache.get()
    # CDN cache for an hour (Vercel honours s-maxage); a partial answer only briefly.
    max_age = CACHE_S if advisory["status"] == "live" else RETRY_S
    response.headers["Cache-Control"] = f"public, s-maxage={max_age}, max-age=300"
    return advisory
