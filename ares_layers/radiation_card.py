"""Static radiation baseline card + EVA-duration dose arithmetic.

WHAT: published MSL RAD surface dose-equivalent rate (Hassler et al. 2014, Science 343,
      doi:10.1126/science.1244797): r = 0.64 +/- 0.12 mSv/day, Gale crater, 2012-2013.
      Dose for an EVA of t hours:   D = r * t / 24,   sigma_D = sigma_r * t / 24
      (t treated as exact; units: mSv/day * h / (h/day) = mSv).
WHY:  gives a defensible order-of-magnitude dose for the briefing.
LIMITS: published mean, NOT live and NOT a forecast. Measured Aug 2012-2013 near SOLAR MAXIMUM (lower GCR); 2026 GCR is likely higher
      (declining phase of cycle 25) -- inference, not a measurement. Verified against Hassler 2014
      Table 1 (GCR only): 0.64 +/- 0.12 mSv/day; 0.21 +/- 0.04 mGy/day; <Q> 3.05 +/- 0.26. Period, rover
      deck (no suit/habitat shielding modelled), excludes SEP events. Arithmetic only.
"""
import sys

import config as C
from ares_geo import write_json

RATE, RATE_SIGMA = 0.64, 0.12      # mSv/day dose equivalent
SOURCE = "Hassler et al. 2014, Science 343, doi:10.1126/science.1244797"


def eva_dose(hours, rate=RATE, sigma=RATE_SIGMA):
    """Return (dose_mSv, sigma_mSv) for an EVA of `hours` hours."""
    if hours < 0:
        raise ValueError("duration must be >= 0")
    return rate * hours / 24.0, sigma * hours / 24.0


def main(durations):
    C.OUT.mkdir(exist_ok=True)
    write_json(C.OUT / "radiation.json", {
        "rate_mSv_per_day": RATE, "sigma_mSv_per_day": RATE_SIGMA, "quantity": "dose equivalent",
        "label": "published mean, MSL RAD 2012-2013, not live", "source": SOURCE,
        "formula": "D = r*t/24, sigma_D = sigma_r*t/24",
        "eva_examples": [{"hours": h, "dose_mSv": round(d, 4), "sigma_mSv": round(s, 4)}
                         for h in durations for d, s in [eva_dose(h)]],
        "limits": "No shielding, no SEP events, no live data. Arithmetic on a published mean.",
    })
    print("radiation.json written for durations", durations)


if __name__ == "__main__":
    main([float(a) for a in sys.argv[1:]] or [4.0, 8.0])
