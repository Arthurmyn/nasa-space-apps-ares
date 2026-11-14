"""Load the data contract once per application instance; never read on requests."""

import json
import logging
import math
from pathlib import Path

import numpy as np

from app.schemas.route import Assumption, Site

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "gale-bx"


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


def load_grid(directory):
    try:
        return Grid(Path(directory)), None
    except (OSError, ValueError, KeyError, TypeError):
        logging.getLogger(__name__).exception("Failed to load terrain data from %s", directory)
        # Keep the health endpoint alive, but never silently substitute terrain.
        return (
            None,
            "Terrain data unavailable: backend/data/gale-bx must contain valid "
            "meta.json, elevation.bin, slope.bin, stops.json and assumptions.json.",
        )
