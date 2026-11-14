"""Space-weather advisory from NASA CCMC DONKI (solar flares, SEP events, CMEs).

WHAT: download the last DONKI_DAYS days of FLR, SEP and CME events, keep a few
      fields per event, write advisory.json. Tries DONKI_BASE, then DONKI_ALT, then DONKI_ALT2.
WHY:  gives the EVA briefing a real, timestamped "is the Sun active?" context.
LIMITS: DONKI events are Earth/L1-based observations. They are NOT a radiation dose
      at Mars and no dose is derived here. Mars may face a different side of the Sun.
"""
import datetime as dt
import requests

import config as C
from ares_geo import write_json

LABEL = ("Space-weather advisory from NASA CCMC DONKI (Earth/L1-based observations). "
         "Not a radiation dose at Mars.")
FIELDS = {"FLR": ["flrID", "classType", "beginTime", "peakTime", "sourceLocation"],
          "SEP": ["sepID", "eventTime"],
          "CME": ["activityID", "startTime", "sourceLocation", "note"]}


def fetch(base, kind, start, end, timeout=20):
    params = {"startDate": start, "endDate": end}
    if "api.nasa.gov" in base:
        params["api_key"] = C.DONKI_KEY
    r = requests.get(f"{base.rstrip('/')}/{kind}", params=params, timeout=timeout)
    r.raise_for_status()
    return r.json() if r.text.strip() else []        # DONKI returns empty body for "no events"


def summarize(kind, events):
    return [{k: e.get(k) for k in FIELDS[kind]} for e in (events or [])]


def mars_impacts(cme_events):
    """WSA-ENLIL MODEL predictions of CME arrival at Mars (CCMC runs this model).
    These are model forecasts of a solar-wind disturbance, not a dose and not a measurement."""
    hits = []
    for e in cme_events or []:
        for a in e.get("cmeAnalyses") or []:
            for run in a.get("enlilList") or []:
                for imp in run.get("impactList") or []:
                    if imp.get("location") == "Mars":
                        hits.append({"cme_id": e.get("activityID"), "source": e.get("sourceLocation"),
                                     "active_region": e.get("activeRegionNum"), "speed_km_s": a.get("speed"),
                                     "arrival_utc": imp.get("arrivalTime"),
                                     "glancing_blow": imp.get("isGlancingBlow"),
                                     "model_run": run.get("link"), "cme_link": e.get("link")})
    # several ENLIL runs can predict the same arrival -> keep one per (CME, arrival time)
    return list({(h["cme_id"], h["arrival_utc"]): h for h in hits}.values())


def main():
    C.OUT.mkdir(exist_ok=True)
    end = dt.date.today()
    start = end - dt.timedelta(days=C.DONKI_DAYS)
    out = {"label": LABEL, "status": "LIVE fetch (event catalogue, not a dose)",
           "fetched_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
           "window": [start.isoformat(), end.isoformat()], "events": {}, "errors": {}}
    for kind in FIELDS:
        for base in (C.DONKI_BASE, C.DONKI_ALT, C.DONKI_ALT2):
            try:
                raw = fetch(base, kind, start.isoformat(), end.isoformat())
                ev = summarize(kind, raw)
                out["events"][kind] = {"source": base, "count": len(ev), "items": ev}
                if kind == "CME":
                    out["mars_cme_arrivals_model"] = {
                        "label": "WSA-ENLIL model prediction (NASA CCMC) of CME arrival at Mars. "
                                 "Model, not a measurement and not a radiation dose.",
                        "items": mars_impacts(raw)}
                break
            except (requests.RequestException, ValueError) as e:
                out["errors"].setdefault(kind, []).append(f"{base}: {type(e).__name__}: {str(e)[:160]}")
    missing = [k for k in FIELDS if k not in out["events"]]
    if missing:
        out["status"] = "INCOMPLETE -- fetch failed for: " + ", ".join(missing)
    write_json(C.OUT / "advisory.json", out)
    print(out["status"], {k: v["count"] for k, v in out["events"].items()})


if __name__ == "__main__":
    main()
