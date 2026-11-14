"""ARES layer pipeline -- every path, AOI and parameter in one place.

WHAT: constants used by all make_*.py scripts.
WHY:  one file to edit on the laptop; nothing is hard-coded elsewhere.
LIMITS: thresholds below are LUNAR ANALOGS [R], not Mars-validated limits.
Set ARES_MODE=synthetic to run on the locally generated SYNTHETIC test data.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODE = os.environ.get("ARES_MODE", "real")          # "real" or "synthetic"
DATA = ROOT / ("data_synthetic" if MODE == "synthetic" else "data")
OUT = ROOT / ("out_synthetic" if MODE == "synthetic" else "out")

# --- Inputs (real files live on the team laptop) ---------------------------
if MODE == "synthetic":
    DTM = DATA / "SYNTHETIC_dtm_same_grid.tif"
    ORTHO = DATA / "SYNTHETIC_ortho.tif"
    THERMAL = DATA / "SYNTHETIC_themis_ti.tif"
else:
    DTM = DATA / "dtm" / "DTEEC_009149_1750_009294_1750_U01.IMG"
    ORTHO = DATA / "ortho" / "PSP_009149_1750_RED_C_01_ORTHO.JP2"
    THERMAL = DATA / "themis" / "THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub"  # TODO: exact file name
STOPS = ROOT / "stops.csv"

# --- Expected DTM georeferencing (from the PDS3 label; used to sanity-check) --
MARS_R = 3396190.0                                   # m, Mars sphere used by the DTM
LON_0 = 137.41                                       # deg E, central meridian
DTM_CRS = f"+proj=eqc +lat_ts=0 +lon_0={LON_0} +x_0=0 +y_0=0 +R={MARS_R} +units=m +no_defs"
DTM_ORIGIN = (-3358.999358004041369, -277179.163589804549702)   # upper-left corner x, y (m)
DTM_PIXEL = 1.011746794579500                        # m
DTM_SHAPE = (14466, 6749)                            # rows, cols
DTM_NODATA = -3.4028227e+38
NODATA_FLOOR = -1e30                                 # anything below this is treated as NoData

# --- Area of interest (planetocentric lat, east lon) -----------------------
AOI = dict(lat_min=-4.8113, lat_max=-4.7802, lon_min=137.3762, lon_max=137.3984)
MARGIN_M = 300.0                                     # extra border so slope/route edges are valid

# --- Slope layer -------------------------------------------------------------
# Thresholds from Pena-Asensio 2024 were derived on 5 m LOLA data; slopes
# computed at 1 m are systematically steeper, so we aggregate to 5 m first.
SLOPE_BASELINE_M = 5.0
SLOPE_THRESHOLDS = {  # degrees, lunar analog [R] -- not validated for Mars suits
    "values": [10.0, 15.0, 20.0],
    "label": "lunar analog [R]",
    # 15 deg: hard limit in Pena-Asensio et al. 2024, Acta Astronautica 214:324-342,
    #   doi:10.1016/j.actaastro.2023.10.010 (lunar, LOLA 5 m/px).
    # 20 deg: lunar suit/system design case "walking up/down/across a slope of up to 20 deg",
    #   EVA-EXP-0075 slide 6 (NTRS 20200001071), summary of EVA-EXP-0042 (not read).
    # 10 deg: DISPLAY BREAK ONLY, no source found for it as a limit -- do not cite as a rule.
    "sources": ["Pena-Asensio et al. 2024, doi:10.1016/j.actaastro.2023.10.010 (15 deg)",
                "NASA EVA-EXP-0075 / NTRS 20200001071 (20 deg design case)",
                "10 deg: display class break, unsourced"],
}

# --- Optical / thermal display ----------------------------------------------
OPTICAL_RES_M = 0.5
OPTICAL_CREDIT = "NASA/JPL-Caltech/UArizona"
THERMAL_CREDIT = "THEMIS quantitative TI mosaic, Fergason et al. 2006 / USGS Astrogeology"
THERMAL_PNG_SCALE = 8                                # nearest-neighbour upscale for display only

# --- Location check anchor ---------------------------------------------------
ELEV_ANCHOR_M = (-3620.0, 100.0)  # coarse context: ~-3620 m is the inferred groundwater level of boxwork
                                  # formation (Siebach & Grotzinger 2014), NOT a surface elevation; +/-100 m
                                  # because boxwork relief is ~100 m. A miss is a warning, not a failure.

# --- DONKI -------------------------------------------------------------------
DONKI_BASE = os.environ.get("DONKI_BASE", "https://ccmc.gsfc.nasa.gov/DONKI/WS/get")  # verified live 15 Nov 2026, no key
# CCMC announced (30 Sep 2026) DONKI moves to ccmc.gsfc.nasa.gov; old kauai host kept as last fallback.
DONKI_ALT = "https://api.nasa.gov/DONKI"  # needs api_key (DEMO_KEY is rate-limited)
DONKI_ALT2 = "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get"
DONKI_KEY = os.environ.get("NASA_API_KEY", "DEMO_KEY")
DONKI_DAYS = 7

# --- Weather card: Mars Climate Database (model climatology) ------------------
MCD_LAT, MCD_LON, MCD_ALT = -4.80, 137.38, 10.0   # site used in the 15 Nov 2026 query
MCD_CACHE_DIR = os.environ.get("MCD_CACHE_DIR", "data/mcd_cache")
# Paste the ASCII-download URL from one browser query and replace the Ls value by {ls}:
MCD_URL_TEMPLATE = os.environ.get("MCD_URL_TEMPLATE", "")
