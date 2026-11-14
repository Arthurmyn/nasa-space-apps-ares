"""Pytest suite. All rasters here are SYNTHETIC (generated in memory), not Mars data."""
import math
import os
import sys
from pathlib import Path

import numpy as np
import pytest
from rasterio.transform import from_origin

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config as C                                              # noqa: E402
from ares_geo import ll_to_xy, xy_to_ll                         # noqa: E402
from make_slope import block_average, horn_slope_deg, classify  # noqa: E402
from radiation_card import eva_dose                             # noqa: E402
from fetch_donki import summarize                               # noqa: E402

PX = 5.0


def plane(deg, n=40, azimuth_axis="x"):
    yy, xx = np.mgrid[0:n, 0:n] * PX
    return np.tan(np.radians(deg)) * (xx if azimuth_axis == "x" else yy)


@pytest.mark.parametrize("axis", ["x", "y"])
def test_a_tilted_plane_12deg(axis):
    s = horn_slope_deg(plane(12.0, azimuth_axis=axis), PX, PX)
    assert np.all(np.abs(s[1:-1, 1:-1] - 12.0) < 0.1)
    assert np.isnan(s[0]).all() and np.isnan(s[:, -1]).all()    # borders are NoData


def test_a_diagonal_plane():
    yy, xx = np.mgrid[0:30, 0:30] * PX
    g = math.tan(math.radians(12.0)) / math.sqrt(2)              # gradient split over x and y
    s = horn_slope_deg(g * xx + g * yy, PX, PX)
    assert np.allclose(s[1:-1, 1:-1], 12.0, atol=0.1)


def test_b_flat_plane():
    s = horn_slope_deg(np.full((20, 20), -1000.0), PX, PX)
    assert np.allclose(s[1:-1, 1:-1], 0.0)


def test_c_nodata_propagates():
    z = np.ma.array(np.zeros((50, 50)), mask=False)
    z.mask[12, 13] = True                                        # one bad pixel
    zb = block_average(z, 5)                                     # -> block (2, 2) is NaN
    assert np.isnan(zb[2, 2]) and np.isfinite(zb).sum() == 99
    s = horn_slope_deg(zb, 5 * PX, 5 * PX)
    assert np.isnan(s[1:4, 1:4]).all()                           # cell + 8 neighbours lost
    assert np.isfinite(s[5:-1, 5:-1]).all()
    assert classify(s, [10, 15, 20])[2, 2] == -1


def test_classes_boundaries():
    assert classify(np.array([0, 10, 10.01, 15, 20, 20.5]), [10, 15, 20]).tolist() == [0, 0, 1, 1, 2, 3]


STOPS = {"Nevado Sajama": (-4.808007, 137.381004), "Yareta": (-4.807908, 137.381119),
         "NS2": (-4.808005, 137.380992)}


@pytest.mark.parametrize("name", STOPS)
def test_d_projection_matches_hand_formula(name):
    lat, lon = STOPS[name]
    t = from_origin(C.DTM_ORIGIN[0], C.DTM_ORIGIN[1], C.DTM_PIXEL, C.DTM_PIXEL)
    x, y = ll_to_xy(C.DTM_CRS, lon, lat)
    xh = C.MARS_R * (lon - C.LON_0) * math.pi / 180              # hand formula
    yh = C.MARS_R * lat * math.pi / 180
    assert abs(x - xh) < 1e-6 and abs(y - yh) < 1e-6
    col, row = ~t @ (x, y)
    assert abs(col - (xh - C.DTM_ORIGIN[0]) / C.DTM_PIXEL) < 1e-6
    assert abs(row - (C.DTM_ORIGIN[1] - yh) / C.DTM_PIXEL) < 1e-6
    assert 0 <= row < C.DTM_SHAPE[0] and 0 <= col < C.DTM_SHAPE[1]   # stop lies on the real DTM
    lon2, lat2 = xy_to_ll(C.DTM_CRS, x, y)                       # round trip
    assert abs(lon2 - lon) < 1e-9 and abs(lat2 - lat) < 1e-9


def test_d_axis_swap_detected():
    from check_location import in_aoi
    lat, lon = STOPS["Yareta"]
    assert in_aoi(lon, lat) and not in_aoi(lat, lon)


def test_e_radiation_dose():
    d, s = eva_dose(24.0)
    assert d == pytest.approx(0.64) and s == pytest.approx(0.12)   # one day = the rate
    d, s = eva_dose(6.0)
    assert d == pytest.approx(0.16) and s == pytest.approx(0.03)   # 0.64*6/24, 0.12*6/24
    assert eva_dose(0.0) == (0.0, 0.0)
    with pytest.raises(ValueError):
        eva_dose(-1)


def test_donki_summarize_offline():
    ev = [{"flrID": "X", "classType": "M1.0", "beginTime": "t0", "peakTime": "t1", "extra": 1}]
    out = summarize("FLR", ev)
    assert out[0]["classType"] == "M1.0" and "extra" not in out[0] and summarize("SEP", None) == []


# ---- MCD weather card + Mars time ------------------------------------------------
def test_mcd_parser_on_real_sample():
    from fetch_mcd import parse_mcd_ascii
    txt = open(os.path.join(os.path.dirname(__file__), "..", "data_samples",
                            "mcd_ls22.3_lat-4.8_lon137.38.txt")).read()
    p = parse_mcd_ascii(txt)["variables"]
    assert set(p) == {"Temperature (K)", "Surface temperature (K)", "Surface pressure (Pa)",
                      "W-E wind component (m/s)"}
    ts = p["Surface temperature (K)"]
    assert len(ts["values"]) == 25 and ts["max"] == 271.707 and ts["max_at_h"] == 13.0
    assert ts["min"] == 182.716 and ts["min_at_h"] == 5.0


def test_solar_longitude_matches_mcd_interface():
    import datetime as dt
    from mars_time import solar_longitude, julian_date
    # MCD v6.2 web page: Earth JD 2461360.333495 -> Ls 22.3 deg (MY39 sol 45)
    t = dt.datetime(2000, 1, 1, 12, tzinfo=dt.timezone.utc) + dt.timedelta(days=2461360.333495 - 2451545.0)
    assert abs(julian_date(t) - 2461360.333495) < 1e-6
    # MCD's own JS converter shows 22.3; Allison & McEwen gives 22.43 -> 0.13 deg apart
    # (converter differences; negligible for a climatology query).
    assert abs(solar_longitude(t) - 22.3) < 0.2


def test_solar_longitude_paper_example():
    import datetime as dt
    from mars_time import solar_longitude
    # Allison & McEwen 2000 worked example: 2000-01-06 00:00 UTC -> Ls = 277.18758 deg
    t = dt.datetime(2000, 1, 6, tzinfo=dt.timezone.utc)
    assert abs(solar_longitude(t) - 277.18758) < 0.001
