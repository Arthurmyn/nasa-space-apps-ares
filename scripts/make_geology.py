"""Cut the USGS Geologic Map of Mars (SIM 3292) down to a site and write its geology.json.

Source: K.L. Tanaka and others, 2014, Geologic Map of Mars, scale 1:20,000,000, USGS Scientific
Investigations Map 3292, https://pubs.usgs.gov/sim/3292 (DOI 10.3133/sim3292). The database ZIP is
about 800 MB; only the polygon shapefile "SIM3292_Global_Geology" (about 64 MB) is needed, and this
script reads just those members of the ZIP with HTTP range requests (the server allows them).

For each site the script

  1. reads the bbox from backend/data/<site>/meta.json,
  2. keeps the unit polygons that touch it and clips them to it,
  3. writes backend/data/<site>/geology.json (format: docs/DATA_CONTRACT.md, section 11).

The shapefile is in degrees on the Mars 2000 sphere (its .prj says so; longitude -180 to 180), the
same sphere as the site grids, so no reprojection happens. A unit is written exactly as the map
gives it: `Unit` is the code and `UnitDesc` the short description. The map is 1:20,000,000, so a
site of a few square kilometres sits inside a single polygon; the file says so.

    python -m scripts.make_geology                       # gale-bx, downloads what it needs
    python -m scripts.make_geology --site gale-001488
    python -m scripts.make_geology --shapefile path/to/SIM3292_Global_Geology.shp
"""

import argparse
import hashlib
import io
import json
import struct
import sys
import urllib.request
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from shapely.geometry import Polygon, box, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PAGE_URL = "https://pubs.usgs.gov/sim/3292/"
ZIP_URL = "https://pubs.usgs.gov/sim/3292/downloads/sim3292_database.zip"
DMU_URL = "https://pubs.usgs.gov/sim/3292/pdf/sim3292_dmu_with_locality_images.pdf"
CITATION = (
    "Tanaka, K.L., Skinner, J.A., Jr., Dohm, J.M., Irwin, R.P., III, Kolb, E.J., Fortezzo, C.M., "
    "Platz, T., Michael, G.G., and Hare, T.M., 2014, Geologic map of Mars: U.S. Geological Survey "
    "Scientific Investigations Map 3292, scale 1:20,000,000, https://doi.org/10.3133/sim3292"
)
MEMBER = "SIM3292_MarsGlobalGeologicGIS_20M/SIM3292_Shapefiles/SIM3292_Global_Geology."
EXTENSIONS = ("shp", "shx", "dbf", "prj")
SCHEMA = "ares.geology/v1"
USER_AGENT = {"User-Agent": "ares-planner-data-script/1.0"}


# ---- Reading only what is needed from the 800 MB ZIP ----------------------------------------


class RangedFile(io.RawIOBase):
    """A read-only file over an http(s) URL, using Range requests."""

    def __init__(self, url: str):
        self.url, self.pos = url, 0
        head = urllib.request.Request(url, method="HEAD", headers=USER_AGENT)
        with urllib.request.urlopen(head, timeout=60) as response:
            self.size = int(response.headers["Content-Length"])

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = (
            offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        )
        return self.pos

    def readinto(self, buffer):
        if self.pos >= self.size:
            return 0
        end = min(self.pos + len(buffer), self.size) - 1
        request = urllib.request.Request(
            self.url, headers={**USER_AGENT, "Range": f"bytes={self.pos}-{end}"}
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
        buffer[: len(data)] = data
        self.pos += len(data)
        return len(data)


def download_shapefile(cache: Path) -> Path:
    """The Global_Geology shapefile in `cache`, fetched from the ZIP unless it is already there."""
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / "SIM3292_Global_Geology.shp"
    if all((cache / f"SIM3292_Global_Geology.{e}").exists() for e in EXTENSIONS):
        return target
    archive = zipfile.ZipFile(io.BufferedReader(RangedFile(ZIP_URL), buffer_size=8 << 20))
    for ext in EXTENSIONS:
        (cache / f"SIM3292_Global_Geology.{ext}").write_bytes(archive.read(MEMBER + ext))
    return target


# ---- Shapefile and dBase readers (polygons only; no extra dependency) ---------------------------


def read_dbf(path: Path) -> list[dict[str, str]]:
    data = path.read_bytes()
    count, header_len, record_len = struct.unpack("<IHH", data[4:12])
    fields, offset = [], 32
    while data[offset] != 0x0D:
        fields.append(
            (data[offset : offset + 11].split(b"\0")[0].decode("ascii"), data[offset + 16])
        )
        offset += 32
    rows = []
    for i in range(count):
        record = data[header_len + i * record_len : header_len + (i + 1) * record_len]
        position, row = 1, {}
        for name, length in fields:
            row[name] = record[position : position + length].decode("latin1").strip()
            position += length
        rows.append(row)
    return rows


def _signed_area(ring):
    return (
        sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1))
        / 2
    )


def read_polygons(path: Path, window: tuple[float, float, float, float]):
    """(record index, shapely geometry) of each polygon record whose bbox meets `window`.

    `window` is (west, south, east, north).

    ESRI writes outer rings clockwise and holes counter-clockwise; that is how they are told apart.
    """
    data = path.read_bytes()
    if struct.unpack("<i", data[32:36])[0] != 5:
        raise ValueError("Not a polygon shapefile")
    west, south, east, north = window
    position, index = 100, 0
    while position < len(data):
        _, words = struct.unpack(">ii", data[position : position + 8])
        body = data[position + 8 : position + 8 + words * 2]
        position += 8 + words * 2
        x0, y0, x1, y1 = struct.unpack("<4d", body[4:36])
        if not (x1 < west or x0 > east or y1 < south or y0 > north):
            parts_n, points_n = struct.unpack("<ii", body[36:44])
            starts = list(struct.unpack(f"<{parts_n}i", body[44 : 44 + 4 * parts_n])) + [points_n]
            offset = 44 + 4 * parts_n
            flat = struct.unpack(f"<{2 * points_n}d", body[offset : offset + 16 * points_n])
            points = [(flat[2 * j], flat[2 * j + 1]) for j in range(points_n)]
            rings = [points[starts[k] : starts[k + 1]] for k in range(parts_n)]
            outer = [Polygon(r).buffer(0) for r in rings if _signed_area(r) < 0]
            holes = [Polygon(r).buffer(0) for r in rings if _signed_area(r) >= 0]
            geometry = unary_union(outer)
            for hole in holes:
                geometry = geometry.difference(hole)
            yield index, geometry
        index += 1


# ---- The site file --------------------------------------------------------------------------


def build(shapefile: Path, bbox: dict, site_id: str) -> dict:
    """The geology.json document for one site."""
    window = (bbox["lon_min"], bbox["lat_min"], bbox["lon_max"], bbox["lat_max"])
    rows = read_dbf(shapefile.with_suffix(".dbf"))
    clip = box(*window)
    features = []
    for index, geometry in read_polygons(shapefile, window):
        part = geometry.intersection(clip)
        if part.is_empty or part.area == 0:
            continue
        row = rows[index]
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "unit": row["Unit"],
                    "name": row["UnitDesc"],
                    "source_url": PAGE_URL,
                },
                "geometry": mapping(part),
            }
        )
    if not features:
        raise ValueError(f"No SIM 3292 unit covers the bbox of {site_id}")
    return {
        "type": "FeatureCollection",
        "ares": {
            "schema": SCHEMA,
            "site_id": site_id,
            "bbox": bbox,
            "scale": "1:20,000,000",
            "source": {
                "title": "Geologic Map of Mars (SIM 3292)",
                "url": PAGE_URL,
                "citation": CITATION,
                "unit_descriptions": DMU_URL,
            },
            "note": (
                "Global map at 1:20,000,000: the units are regional and a site of a few square "
                "kilometres is one polygon. `unit` is the map's code and `name` its short unit "
                "description (the `UnitDesc` field); "
                "the long descriptions are in the map's Description of Map Units."
            ),
        },
        "features": features,
    }


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--site", default="gale-bx", help="folder under backend/data")
    parser.add_argument(
        "--shapefile", type=Path, help="SIM3292_Global_Geology.shp, instead of downloading"
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=ROOT / "data/geology",
        help="where the download is kept (not committed)",
    )
    parser.add_argument("--data-root", type=Path, default=ROOT / "backend/data")
    args = parser.parse_args(argv)

    meta = json.loads((args.data_root / args.site / "meta.json").read_text())
    shapefile = args.shapefile or download_shapefile(args.cache)
    try:
        document = build(shapefile, meta["bbox"], meta["site_id"])
    except ValueError as e:
        print(f"Could not make the geology file: {e}", file=sys.stderr)
        return 1
    document["ares"]["source"] |= {
        "fetched_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "shapefile_sha256": sha256(shapefile),
        "shapefile_bytes": shapefile.stat().st_size,
    }
    output = args.data_root / args.site / "geology.json"
    output.write_text(json.dumps(document, indent=2) + "\n")
    units = ", ".join(
        f"{f['properties']['unit']} ({f['properties']['name']})" for f in document["features"]
    )
    print(f"{output}: {len(document['features'])} unit(s): {units}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
