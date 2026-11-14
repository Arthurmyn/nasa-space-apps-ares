"""Mars season (solar longitude Ls) from an Earth UTC time.

WHAT: Ls in degrees for a given UTC datetime.
HOW:  Allison & McEwen (2000), Planet. Space Sci. 48, 215-235 (the "Mars24" algorithm),
      steps A-B-C: Julian date -> mean anomaly M -> fictitious mean sun alpha_FMS ->
      equation of centre (with planetary perturbations PBS) -> Ls = alpha_FMS + (nu - M).
      TT-UTC is taken as 69.184 s (leap seconds as of 2017+); its effect on Ls is ~1e-5 deg.
WHY:  lets the app pick today's season for the MCD climatology without asking anyone.
LIMITS: accuracy ~0.01 deg in Ls (paper). Independent check in tests: the MCD v6.2 web
      interface converted the same Earth date to Ls 22.3 deg.
"""
import datetime as dt
import math

_PBS = [  # (A_i [deg], tau_i [Julian years], phi_i [deg]) -- Allison & McEwen 2000, Table 5
    (0.0071, 2.2353, 49.409), (0.0057, 2.7543, 168.173), (0.0039, 1.1177, 191.837),
    (0.0037, 15.7866, 21.736), (0.0021, 2.1354, 15.704), (0.0020, 2.4694, 95.528),
    (0.0018, 32.8493, 49.095)]
TT_MINUS_UTC_S = 69.184


def julian_date(t_utc: dt.datetime) -> float:
    epoch = dt.datetime(2000, 1, 1, 12, tzinfo=dt.timezone.utc)   # JD 2451545.0
    return 2451545.0 + (t_utc - epoch).total_seconds() / 86400.0


def solar_longitude(t_utc: dt.datetime) -> float:
    d = julian_date(t_utc) + TT_MINUS_UTC_S / 86400.0 - 2451545.0       # days since J2000 (TT)
    M = math.radians(19.3871 + 0.52402073 * d)
    a_fms = 270.3871 + 0.524038496 * d
    pbs = sum(A * math.cos(math.radians(0.985626 * d / tau + phi)) for A, tau, phi in _PBS)
    eoc = ((10.691 + 3.0e-7 * d) * math.sin(M) + 0.623 * math.sin(2 * M) + 0.050 * math.sin(3 * M)
           + 0.005 * math.sin(4 * M) + 0.0005 * math.sin(5 * M) + pbs)
    return (a_fms + eoc) % 360.0


if __name__ == "__main__":
    now = dt.datetime.now(dt.timezone.utc)
    print(f"UTC {now.isoformat(timespec='seconds')}  Ls = {solar_longitude(now):.2f} deg")
