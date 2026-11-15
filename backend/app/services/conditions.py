"""Curiosity REMS weather, proxied from NASA and cached in memory for an hour.

The feed is the JSON that mars.nasa.gov publishes for the Rover Environmental Monitoring Station,
provided by the Centro de Astrobiologia (CAB), for outreach. Nothing here raises: a failure becomes
{"available": false, "reason": ...}.
"""

import logging
import threading
import time
from datetime import datetime, timezone

import httpx

FEED_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
CACHE_TTL_S = 3600
FAILURE_TTL_S = 60  # do not hammer a feed that just failed
TIMEOUT_S = 10.0

PROVIDER = (
    "Centro de Astrobiologia (CAB, CSIC-INTA), Rover Environmental Monitoring Station, "
    "Mars Science Laboratory"
)
DISCLAIMER = (
    "Provided by CAB for outreach purposes only. The values are measured at the rover's own "
    "position and are influenced by the rover; they are not a forecast and not for a planned route."
)

logger = logging.getLogger(__name__)
_lock = threading.Lock()
_cache: dict = {"at": 0.0, "ttl": 0.0, "value": None}


def fetch_feed() -> dict:
    """Download the weather feed. Replaced in tests."""
    response = httpx.get(FEED_URL, timeout=TIMEOUT_S, follow_redirects=True)
    response.raise_for_status()
    return response.json()


def _number(value) -> float | None:
    """REMS writes numbers as strings and uses "--" for no value."""
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def _text(value) -> str | None:
    text = str(value).strip() if value is not None else ""
    return None if text in ("", "--") else text


def normalize(feed: dict, now: float) -> dict:
    """The newest sol of the feed as a small object with units in the names."""
    soles = [s for s in feed["soles"] if _number(s.get("sol")) is not None]
    if not soles:
        raise ValueError("the feed has no sols")
    latest = max(soles, key=lambda s: _number(s["sol"]))
    return {
        "available": True,
        "provider": PROVIDER,
        "disclaimer": DISCLAIMER,
        "source_url": FEED_URL,
        "sol": int(_number(latest["sol"])),
        "earth_date": _text(latest.get("terrestrial_date")),
        "ls_deg": _number(latest.get("ls")),
        "season": _text(latest.get("season")),
        "air_temp_min_c": _number(latest.get("min_temp")),
        "air_temp_max_c": _number(latest.get("max_temp")),
        "ground_temp_min_c": _number(latest.get("min_gts_temp")),
        "ground_temp_max_c": _number(latest.get("max_gts_temp")),
        "pressure_pa": _number(latest.get("pressure")),
        "pressure_note": _text(latest.get("pressure_string")),
        "sunrise": _text(latest.get("sunrise")),
        "sunset": _text(latest.get("sunset")),
        "uv_index": _text(latest.get("local_uv_irradiance_index")),
        "opacity": _text(latest.get("atmo_opacity")),
        "wind_speed": _number(latest.get("wind_speed")),
        "fetched_at": datetime.fromtimestamp(now, timezone.utc).isoformat().replace("+00:00", "Z"),  # noqa: UP017
    }


def get_conditions(now=time.time) -> dict:
    """Cached conditions, or {"available": false, "reason": ...}; never raises."""
    with _lock:
        t = now()
        if _cache["value"] is not None and t - _cache["at"] < _cache["ttl"]:
            return _cache["value"]
        try:
            value = normalize(fetch_feed(), t)
            ttl = CACHE_TTL_S
        except Exception as exc:  # any failure: network, status, JSON, shape
            logger.warning("REMS weather unavailable: %s", exc)
            value = {
                "available": False,
                "reason": "The NASA REMS weather feed could not be read right now.",
            }
            ttl = FAILURE_TTL_S
        _cache.update(at=t, ttl=ttl, value=value)
        return value


def clear_cache() -> None:
    with _lock:
        _cache.update(at=0.0, ttl=0.0, value=None)
