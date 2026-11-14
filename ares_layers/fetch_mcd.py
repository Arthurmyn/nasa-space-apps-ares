"""Weather card from the Mars Climate Database (MCD) -- model climatology for TODAY's season.

WHAT: (1) compute today's Ls (mars_time.py); (2) download the MCD web-interface ASCII output
      for our site at that Ls (once per day, cached); (3) parse it into weather.json with
      hourly values + min/max. If the LMD server fails, fall back to the newest cached file.
WHY:  there is no live weather feed for Gale; MCD gives the expected diurnal cycle for the
      current season, which is honest to show as "model climatology", NOT a forecast.
LIMITS: GCM climatology (MCD v6.2, LMD/OU/IAA/ESA/CNES), not observations; 'climatology
      average solar' dust/EUV scenario; one grid point interpolated to our lat/lon with
      high-res topography. Do not query the LMD server more than ~once per day.
HOW TO SET THE URL: run one query in the browser with the wanted variables, copy the
      "Click here to download an ASCII file" link (or the result-page URL) into
      MCD_URL_TEMPLATE in config.py and replace the Ls value by {ls}.
"""
import datetime as dt
import glob
import json
import os
import re
import sys

import config as C
from mars_time import solar_longitude

_HDR_VAR = re.compile(r"Column 2 is (.+)")
_HDR_INFO = re.compile(r"### (MCD_v[\d.]+.*)")


def parse_mcd_ascii(text: str) -> dict:
    """Parse one MCD ASCII download (several '###' blocks, two numeric columns each)."""
    blocks, cur = [], None
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            m = _HDR_VAR.search(s)
            if m:
                cur = {"variable": m.group(1).strip(), "local_time_h": [], "values": []}
                blocks.append(cur)
            elif cur is None or cur["values"]:
                info = _HDR_INFO.search(s)
                if info:
                    header = info.group(1)
            continue
        if cur is None:
            continue
        lt, val = (float(x) for x in s.split()[:2])
        cur["local_time_h"].append(lt)
        cur["values"].append(val)
    out = {}
    for b in blocks:
        v, lt = b["values"], b["local_time_h"]
        i_min, i_max = v.index(min(v)), v.index(max(v))
        out[b["variable"]] = {"local_time_h": lt, "values": v,
                              "min": v[i_min], "min_at_h": lt[i_min],
                              "max": v[i_max], "max_at_h": lt[i_max]}
    meta = [l for l in text.splitlines() if l.startswith("### MCD_v") or l.startswith("### Ls ")]
    return {"meta": [m.lstrip("# ").strip() for m in meta[:2]], "variables": out}


def build_card(parsed: dict, ls: float, source: str) -> dict:
    return {"label": "Model climatology for today's season (Mars Climate Database v6.2, "
                     "LMD/OU/IAA/ESA/CNES). Not a forecast, not a measurement.",
            "status": "MODEL", "ls_deg": round(ls, 2), "source": source,
            "site": {"lat": C.MCD_LAT, "lon_e": C.MCD_LON, "alt_m_above_surface": C.MCD_ALT},
            "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            **parsed}


def main():
    import requests
    os.makedirs(C.MCD_CACHE_DIR, exist_ok=True)
    ls = solar_longitude(dt.datetime.now(dt.timezone.utc))
    cache = os.path.join(C.MCD_CACHE_DIR, f"mcd_ls{ls:.1f}.txt")
    text, source = None, None
    if os.path.exists(cache):
        text, source = open(cache).read(), f"cache {cache}"
    elif C.MCD_URL_TEMPLATE:
        try:
            r = requests.get(C.MCD_URL_TEMPLATE.format(ls=f"{ls:.1f}"), timeout=60)
            r.raise_for_status()
            text, source = r.text, "LMD MCD web interface (fetched today)"
            open(cache, "w").write(text)
        except requests.RequestException as e:
            print("MCD fetch failed:", e, file=sys.stderr)
    if text is None:   # fallback: nearest cached season
        files = sorted(glob.glob(os.path.join(C.MCD_CACHE_DIR, "*.txt")) + glob.glob("data_samples/mcd_*.txt"))
        if not files:
            sys.exit("No MCD data available (no URL, no cache).")
        text, source = open(files[-1]).read(), f"FALLBACK cached file {files[-1]}"
    card = build_card(parse_mcd_ascii(text), ls, source)
    C.OUT.mkdir(exist_ok=True)
    json.dump(card, open(C.OUT / "weather.json", "w"), indent=1)
    print(card["status"], card["source"], {k: (round(v["min"], 1), round(v["max"], 1))
                                           for k, v in card["variables"].items()})


if __name__ == "__main__":
    main()
