"""Load the data contract once per application instance; never read on requests."""

import json
import logging
import math
from pathlib import Path

import numpy as np

from app.schemas.route import Assumption, Site

DATA_ROOT = Path(__file__).resolve().parents[2] / "data"
DEFAULT_SITE_ID = "gale-bx"


class Grid:
    def __init__(self, directory: Path):
        def read(name):
            return json.loads((directory / f"{name}.json").read_text(encoding="utf-8"))

        self.meta = m = read("meta")
        if m["schema"] != "ares.grid/v1":
            raise ValueError("Unsupported grid schema")
        self.width, self.height = int(m["width"]), int(m["height"])
        self.cell = float(m["cell_m"])
        self.radius = float(m["mars_radius_m"])
        self.lon0, self.lat0 = m["center"]["lon"], m["center"]["lat"]
        self.x_min, self.y_max = m["x_min_m"], m["y_max_m"]
        self.lon_scale = self.radius * math.cos(math.radians(self.lat0))
        if (
            self.width <= 0
            or self.height <= 0
            or not all(
                math.isfinite(v) and v > 0
                for v in (self.cell, self.radius, self.lon_scale, m["slope_unit_deg"])
            )
        ):
            raise ValueError("Invalid grid dimensions or scale")
        count = self.width * self.height
        if (directory / "elevation.bin").stat().st_size != count * 4 or (
            directory / "slope.bin"
        ).stat().st_size != count:
            raise ValueError("Grid binary size does not match metadata")
        self.elevation = np.fromfile(directory / "elevation.bin", dtype="<f4")
        raw = np.fromfile(directory / "slope.bin", dtype=np.uint8)
        self.slope = raw.astype(float) * m["slope_unit_deg"]
        self.valid = (raw != m["slope_nodata"]) & np.isfinite(self.elevation)
        self.assumptions = a = read("assumptions")
        self.limit, self.caution, self.speed = map(
            float, (a["slope_limit_deg"], a["slope_caution_deg"], a["speed_kmh"])
        )
        if (
            not all(math.isfinite(v) for v in (self.limit, self.caution, self.speed))
            or not 0 <= self.caution <= self.limit <= 90
            or self.limit <= 0
            or self.speed <= 0
        ):
            raise ValueError("Invalid slope thresholds or walking speed")
        self.items = [Assumption.model_validate(item) for item in a["items"]]
        # Optional: the longest EVA, in seconds, the round trip is checked against.
        self.eva_limit_s = float(a["eva_limit_s"]) if "eva_limit_s" in a else None
        if self.eva_limit_s is not None and not (
            math.isfinite(self.eva_limit_s) and self.eva_limit_s > 0
        ):
            raise ValueError("eva_limit_s must be a positive number of seconds")
        # Optional: the longest walk back to the start from any route point, metres and seconds.
        self.return_limit_m = float(a["return_limit_m"]) if "return_limit_m" in a else None
        self.return_limit_s = float(a["return_limit_s"]) if "return_limit_s" in a else None
        for value in (self.return_limit_m, self.return_limit_s):
            if value is not None and not (math.isfinite(value) and value > 0):
                raise ValueError("return_limit_m and return_limit_s must be positive numbers")
        self.layers = read_layer_files(directory, m)
        stops = read("stops")
        self.site = Site(id=m["site_id"], name=m["name"], **stops)
        for array in (self.elevation, self.slope, self.valid):
            array.flags.writeable = False

    def xy(self, lon, lat):
        return self.lon_scale * math.radians(lon - self.lon0), self.radius * math.radians(
            lat - self.lat0
        )

    def lonlat(self, x, y):
        return self.lon0 + math.degrees(x / self.lon_scale), self.lat0 + math.degrees(
            y / self.radius
        )

    def cell_index(self, point):
        x, y = self.xy(point.lon, point.lat)
        col = math.floor((x - self.x_min) / self.cell)
        row = math.floor((self.y_max - y) / self.cell)
        if not (0 <= row < self.height and 0 <= col < self.width):
            raise ValueError(f"Point '{point.id}' is outside the terrain grid.")
        index = row * self.width + col
        if not self.valid[index]:
            raise ValueError(
                f"Point '{point.id}' is in a no-data cell (elevation or slope missing)."
            )
        return index

    def center_xy(self, index):
        row, col = divmod(index, self.width)
        return self.x_min + (col + 0.5) * self.cell, self.y_max - (row + 0.5) * self.cell


# Layers that ship as an image plus a small JSON next to meta.json (docs/DATA_CONTRACT.md, 2b).
IMAGE_LAYERS = {"thermal": "ares.thermal/v1"}


def read_layer_files(directory: Path, meta: dict) -> dict[str, dict]:
    """The JSON of every image layer whose file is present and matches this site's grid.

    A layer file that is malformed, for another site or for another bbox is ignored with a log
    line: the layer then stays "No data for this site" instead of drawing in the wrong place.
    """
    found: dict[str, dict] = {}
    for layer, schema in IMAGE_LAYERS.items():
        path = directory / f"{layer}.json"
        if not path.exists():
            continue
        try:
            info = json.loads(path.read_text(encoding="utf-8"))
            if (
                info["schema"] != schema
                or info["layer"] != layer
                or info["site_id"] != meta["site_id"]
                or info["bbox"] != meta["bbox"]
                or not isinstance(info["source"]["title"], str)
            ):
                raise ValueError("does not match this site")
            found[layer] = info
        except (OSError, ValueError, KeyError, TypeError):
            logging.getLogger(__name__).exception("Ignoring layer file %s", path)
    return found


def load_grid(directory):
    try:
        return Grid(Path(directory)), None
    except (OSError, ValueError, KeyError, TypeError):
        logging.getLogger(__name__).exception("Failed to load terrain data from %s", directory)
        # Keep the health endpoint alive, but never silently substitute terrain.
        return (
            None,
            f"Terrain data unavailable: {Path(directory).name} must contain valid "
            "meta.json, elevation.bin, slope.bin, stops.json and assumptions.json.",
        )


def site_directories(root) -> list[Path]:
    """The site folders under `root`, or `root` itself when it holds a single site (meta.json)."""
    root = Path(root)
    if (root / "meta.json").is_file():
        return [root]
    if not root.is_dir():
        return []
    return sorted(p for p in root.iterdir() if (p / "meta.json").is_file())


def load_grids(root) -> tuple[dict[str, Grid], str | None]:
    """Load every site under `root`. Returns {site_id: Grid} and an error text when none loaded.

    A site that fails to load is logged and left out: it never falls back to another site's
    terrain. A folder whose meta.json names another site_id is rejected so that an id always
    means the same terrain.
    """
    grids: dict[str, Grid] = {}
    error = None
    for directory in site_directories(root) or [Path(root)]:
        grid, failure = load_grid(directory)
        if grid is None:
            error = error or failure
            continue
        site_id = grid.site.id
        if len(site_directories(root)) > 1 and directory.name != site_id:
            logging.getLogger(__name__).error(
                "Skipping %s: meta.json site_id is %s", directory, site_id
            )
            continue
        grids[site_id] = grid
    if not grids and error is None:
        error = "Terrain data unavailable: no site folder with meta.json was found."
    return grids, error


def default_site_id(grids: dict[str, Grid]) -> str | None:
    """gale-bx when loaded (backward compatible), otherwise the first site by id."""
    if DEFAULT_SITE_ID in grids:
        return DEFAULT_SITE_ID
    return min(grids) if grids else None
