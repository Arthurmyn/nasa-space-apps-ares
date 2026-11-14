"""Space-weather advisory from NASA CCMC DONKI (solar flares, SEP events, CMEs).

WHAT: the last DAYS days of FLR, SEP and CME events, a few fields each, plus the WSA-ENLIL
      model's predicted CME arrivals at Mars (cmeAnalyses[].enlilList[].impactList[], location "Mars").
WHY:  gives the EVA briefing a timestamped "is the Sun active?" context. This is the only live
      block in the app.
LIMITS: DONKI events are observed from Earth orbit or L1. They are NOT a radiation dose at Mars
      and no dose is derived here. Mars arrivals are model forecasts, not measurements.
Server side only: the browser never calls DONKI (CORS not checked). Results are cached.
"""

from __future__ import annotations

import datetime as dt
import threading
import time
from collections.abc import Callable

import httpx

HOSTS = (
    "https://ccmc.gsfc.nasa.gov/DONKI/WS/get",  # no key needed, checked 15 Nov 2026
    "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get",  # legacy host, last fallback
)
DAYS = 7
CACHE_S = 3600
RETRY_S = 60
TIMEOUT_S = 15.0

LABEL = (
    "Space weather advisory (live, NASA CCMC DONKI). Solar events observed from Earth orbit. "
    "Not a radiation dose at Mars."
)
MARS_LABEL = (
    "CME arrival at Mars (model forecast, NASA CCMC WSA-ENLIL). "
    "Model, not a measurement or a radiation dose."
)
CREDIT = (
    "NASA CCMC DONKI; instruments SOHO LASCO (ESA/NASA), STEREO-A (NASA), "
    "GOES CCOR-1 (NOAA), SDO (NASA)"
)
FIELDS = {
    "FLR": ("flrID", "classType", "beginTime", "peakTime", "sourceLocation", "link"),
    "SEP": ("sepID", "eventTime", "link"),
    "CME": ("activityID", "startTime", "sourceLocation", "link"),
}

Fetch = Callable[[str, str, str, str], list]


def http_fetch(client: httpx.Client) -> Fetch:
    def fetch(host: str, kind: str, start: str, end: str) -> list:
        r = client.get(f"{host}/{kind}", params={"startDate": start, "endDate": end})
        r.raise_for_status()
        # DONKI answers an empty body when there are no events.
        return r.json() if r.text.strip() else []

    return fetch


def mars_arrivals(cmes: list) -> list[dict]:
    """One entry per (CME, predicted arrival time); several ENLIL runs can repeat an arrival."""
    hits: dict[tuple, dict] = {}
    for e in cmes or []:
        for a in e.get("cmeAnalyses") or []:
            for run in a.get("enlilList") or []:
                for imp in run.get("impactList") or []:
                    if imp.get("location") != "Mars":
                        continue
                    hits[(e.get("activityID"), imp.get("arrivalTime"))] = {
                        "cme_id": e.get("activityID"),
                        "arrival_utc": imp.get("arrivalTime"),
                        "glancing_blow": imp.get("isGlancingBlow"),
                        "speed_km_s": a.get("speed"),
                        "source_location": e.get("sourceLocation"),
                        "model_run": run.get("link"),
                        "cme_link": e.get("link"),
                    }
    return sorted(hits.values(), key=lambda h: h["arrival_utc"] or "")


def build_advisory(fetch: Fetch, today: dt.date) -> dict:
    start, end = (today - dt.timedelta(days=DAYS)).isoformat(), today.isoformat()
    events: dict[str, dict] = {}
    errors: dict[str, list[str]] = {}
    arrivals: list[dict] | None = None
    for kind, fields in FIELDS.items():
        for host in HOSTS:
            try:
                raw = fetch(host, kind, start, end)
            except (httpx.HTTPError, ValueError) as exc:
                errors.setdefault(kind, []).append(f"{host}: {type(exc).__name__}")
                continue
            items = [{k: e.get(k) for k in fields} for e in raw or []]
            events[kind] = {"count": len(items), "items": items}
            if kind == "CME":
                arrivals = mars_arrivals(raw)
            break
    missing = [k for k in FIELDS if k not in events]
    return {
        "label": LABEL,
        "credit": CREDIT,
        "status": "live" if not missing else "incomplete",
        "missing": missing,
        "fetched_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "window": [start, end],
        "events": events,
        "mars_cme_arrivals": None if arrivals is None else {"label": MARS_LABEL, "items": arrivals},
        "errors": errors,
    }


class AdvisoryCache:
    """Keeps one advisory for CACHE_S seconds; an incomplete one only for RETRY_S."""

    def __init__(self, fetch: Fetch | None = None, clock: Callable[[], float] = time.monotonic):
        self._fetch = fetch
        self._clock = clock
        self._lock = threading.Lock()
        self._value: dict | None = None
        self._expires = 0.0

    def get(self) -> dict:
        with self._lock:
            if self._value is not None and self._clock() < self._expires:
                return self._value
            if self._fetch is not None:
                value = build_advisory(self._fetch, dt.date.today())
            else:
                with httpx.Client(timeout=TIMEOUT_S, follow_redirects=True) as client:
                    value = build_advisory(http_fetch(client), dt.date.today())
            self._value = value
            self._expires = self._clock() + (CACHE_S if value["status"] == "live" else RETRY_S)
            return value
