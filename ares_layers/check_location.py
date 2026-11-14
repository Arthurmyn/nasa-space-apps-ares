"""Sanity-check rover stop coordinates against the AOI and the DTM.

WHAT: for each stop (lon, lat): inside AOI? DTM row/col, DTM elevation, difference to
      the elevation anchor in config. Warns if swapping lat/lon would put a point inside
      (classic axis-order bug) or if a point is off the DTM.
WHY:  one wrong axis order or CRS silently shifts every layer by kilometres.
LIMITS: elevation is the nearest DTM pixel (no interpolation). The anchor is a coarse
      regional check (+/- tolerance), not validation of the DTM.
Input: CSV with header name,lon,lat  or GeoJSON Point features (coords = [lon, lat]).
"""
import csv
import json
import sys
from pathlib import Path

import rasterio

import config as C
from ares_geo import ll_to_xy, write_json


def load_stops(path):
    path = Path(path)
    if path.suffix.lower() in (".geojson", ".json"):
        feats = json.loads(path.read_text())["features"]
        return [(f["properties"].get("name", str(i)), *f["geometry"]["coordinates"][:2])
                for i, f in enumerate(feats)]
    with open(path) as fh:
        return [(r["name"], float(r["lon"]), float(r["lat"])) for r in csv.DictReader(fh)]


def in_aoi(lon, lat, a=C.AOI):
    return a["lon_min"] <= lon <= a["lon_max"] and a["lat_min"] <= lat <= a["lat_max"]


def check(ds, name, lon, lat):
    x, y = ll_to_xy(ds.crs, lon, lat)
    row, col = ds.index(x, y)
    r = {"name": name, "lon": lon, "lat": lat, "inside_aoi": in_aoi(lon, lat),
         "x_m": x, "y_m": y, "row": int(row), "col": int(col), "warnings": []}
    if not r["inside_aoi"] and in_aoi(lat, lon):
        r["warnings"].append("lat/lon look SWAPPED (swapped point falls inside AOI)")
    if 0 <= row < ds.height and 0 <= col < ds.width:
        z = float(ds.read(1, window=((row, row + 1), (col, col + 1)))[0, 0])
        if z < C.NODATA_FLOOR or z != z:
            r["warnings"].append("DTM NoData at this point")
        else:
            anchor, tol = C.ELEV_ANCHOR_M
            r.update(elev_m=z, diff_to_anchor_m=z - anchor)
            if abs(z - anchor) > tol:
                r["warnings"].append(f"elevation {z:.1f} m outside anchor {anchor}+/-{tol} m")
    else:
        r["warnings"].append("point is outside the DTM")
    return r


def main(path=C.STOPS):
    C.OUT.mkdir(exist_ok=True)
    with rasterio.open(C.DTM) as ds:
        res = [check(ds, *s) for s in load_stops(path)]
    for r in res:
        print(f"{r['name']:<14} aoi={r['inside_aoi']!s:<5} row={r['row']:<6} col={r['col']:<6} "
              f"z={r.get('elev_m', float('nan')):.1f} {'; '.join(r['warnings'])}")
    write_json(C.OUT / "stops_check.json", {"mode": C.MODE, "anchor_m": C.ELEV_ANCHOR_M,
                                           "anchor_source": "Siebach & Grotzinger 2014 [TO BE VERIFIED]",
                                           "stops": res})
    return res


if __name__ == "__main__":
    main(*sys.argv[1:])
