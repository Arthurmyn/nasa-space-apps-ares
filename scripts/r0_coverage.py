"""Reproduce issue #3: exact valid-pixel footprints vs Curiosity sols 4534–4805.

Run from the repository root: python -m scripts.r0_coverage --download
GeoJSON coordinates in this workflow are Mars planetocentric degrees, NOT WGS84.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import matplotlib
import numpy as np
import rasterio
import requests
from pyproj import CRS, Transformer
from rasterio.features import shapes
from shapely.affinity import affine_transform
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform, unary_union

matplotlib.use("Agg")
from matplotlib import pyplot as plt  # noqa: E402

WAYPOINT_URL = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json"
PDS = "https://www.uahirise.org/PDS/DTM/PSP"
PRODUCTS = {
    "DTEEC_001488_1750_001752_1750_U02": (
        f"{PDS}/ORB_001400_001499/PSP_001488_1750_PSP_001752_1750/"
        "DTEEC_001488_1750_001752_1750_U02.IMG"
    ),
    "DTEEC_009149_1750_009294_1750_U01": (
        f"{PDS}/ORB_009100_009199/PSP_009149_1750_PSP_009294_1750/"
        "DTEEC_009149_1750_009294_1750_U01.IMG"
    ),
}
COORDINATES = "Mars planetocentric latitude; east longitude; degrees; NOT EPSG:4326"


def select_waypoints(collection: dict) -> list[dict]:
    """Keep all available drive positions in the inclusive campaign interval."""
    selected = []
    for feature in collection["features"]:
        sol = feature.get("properties", {}).get("sol")
        if not isinstance(sol, int):
            raise ValueError("Every waypoint must have an integer sol")
        if 4534 <= sol <= 4805:
            geometry = feature.get("geometry", {})
            coords = geometry.get("coordinates", [])
            if (
                geometry.get("type") != "Point"
                or len(coords) < 2
                or not np.isfinite(coords[:2]).all()
                or not 0 <= coords[0] <= 360
                or not -90 <= coords[1] <= 90
            ):
                raise ValueError(f"Invalid Mars waypoint at sol {sol}")
            selected.append(feature)
    if not selected:
        raise ValueError("No waypoints in sols 4534–4805")
    return sorted(selected, key=lambda f: f["properties"]["sol"])


def footprint(path: Path) -> tuple:
    """Polygonize native resolution, retaining holes and disconnected components."""
    with rasterio.open(path) as src:
        if src.crs is None or src.nodata is None:
            raise ValueError(f"Missing CRS or NoData: {path}")
        crs = CRS.from_wkt(src.crs.to_wkt())
        if not 3_300_000 < crs.ellipsoid.semi_major_metre < 3_500_000:
            raise ValueError(f"Not a Mars CRS: {crs.name}")
        pieces, count = [], 0
        # Read strips so neither the full float raster nor a full mask is needed in RAM.
        for row in range(0, src.height, 512):
            window = rasterio.windows.Window(0, row, src.width, min(512, src.height - row))
            values = src.read(1, window=window, masked=True)
            valid = (~np.ma.getmaskarray(values)) & np.isfinite(values.data)
            count += int(valid.sum())
            pieces.extend(
                shape(g)
                for g, value in shapes(
                    valid.astype("uint8"),
                    mask=valid,
                    transform=rasterio.Affine.translation(0, row),
                )
                if value == 1
            )
        if not count:
            raise ValueError(f"No valid pixels: {path}")
        # Union on the integer pixel lattice before projecting: floating-point
        # strip origins otherwise leave microscopic gaps along strip boundaries.
        affine = src.transform
        geometry = affine_transform(
            unary_union(pieces), [affine.a, affine.b, affine.d, affine.e, affine.c, affine.f]
        )
        metadata = {
            "crs_wkt": crs.to_wkt(),
            "crs_proj": src.crs.to_proj4(),
            "geographic_crs_wkt": crs.geodetic_crs.to_wkt(),
            "radius_m": crs.ellipsoid.semi_major_metre,
            "pixel_size_m": list(src.res),
            "nodata": float(src.nodata),
            "valid_pixels": count,
            "width": src.width,
            "height": src.height,
            "method": "native-resolution GDAL polygonization of unmasked finite pixels",
        }
    return geometry, metadata


def coverage(geometry, waypoints: list[dict]) -> dict:
    inside = [
        f["properties"]["sol"]
        for f in waypoints
        if geometry.covers(Point(f["geometry"]["coordinates"][:2]))
    ]
    outside = [
        f["properties"]["sol"]
        for f in waypoints
        if not geometry.covers(Point(f["geometry"]["coordinates"][:2]))
    ]
    return {
        "n_points": len(waypoints),
        "n_inside": len(inside),
        "sol_range_inside": [min(inside), max(inside)] if inside else None,
        "outside_sols": outside,
    }


def select_candidate(results: list[dict]) -> str | None:
    """Prefer the primary product, but require every selected position to be covered."""
    return next(
        (r["product_id"] for r in results if r["n_points"] > 0 and r["n_inside"] == r["n_points"]),
        None,
    )


def rover_crs_check(waypoints: list[dict]) -> dict:
    """Check MMGIS against PLACES SIS §4.4.2.4, pp.33–34, not Earth's CRS."""
    radius = 3396190  # PLACES SIS defines this radius for its northing/easting formula.
    residuals = [
        abs(f["properties"][field] - np.deg2rad(f["geometry"]["coordinates"][i]) * radius)
        for f in waypoints
        for i, field in enumerate(("easting", "northing"))
    ]
    maximum = float(max(residuals))
    if not np.isfinite(maximum) or maximum > 0.05:
        raise ValueError("MMGIS coordinates disagree with PLACES planetocentric formulas")
    return {
        "method": "PLACES SIS §4.4.2.4: lon=easting/R, planetocentric lat=northing/R",
        "radius_m": radius,
        "max_residual_m": maximum,
        "tolerance_m": 0.05,
        "source_url": (
            "https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/document/PLACES_PDS_SIS.pdf"
        ),
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, path: Path) -> None:
    """Publish only complete downloads; a failed transfer never becomes a cache hit."""
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    with requests.get(url, stream=True, timeout=(15, 90)) as response:
        response.raise_for_status()
        if response.status_code != 200:
            raise ValueError(f"Expected full download, got HTTP {response.status_code}: {url}")
        with temporary.open("wb") as stream:
            for block in response.iter_content(1024 * 1024):
                stream.write(block)
        expected = response.headers.get("Content-Length")
        if expected and temporary.stat().st_size != int(expected):
            raise ValueError(f"Incomplete download: {url}")
    temporary.replace(path)


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    indent = None if path.suffix == ".geojson" else 2
    path.write_text(json.dumps(data, indent=indent, allow_nan=False) + "\n", encoding="utf-8")


def plot_overlay(geometries: dict, waypoints: list[dict], center: list | None, path: Path):
    fig, ax = plt.subplots(figsize=(10, 9))
    for (product, geometry), color in zip(geometries.items(), ["#345c9c", "#bd6b2a"], strict=True):
        polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
        first = True
        for polygon in polygons:
            x, y = polygon.exterior.xy
            ax.plot(x, y, color=color, linewidth=0.7, label=product if first else None)
            first = False
            for ring in polygon.interiors:
                ax.plot(*ring.xy, color=color, linewidth=0.3)
    coordinates = np.array([f["geometry"]["coordinates"][:2] for f in waypoints])
    sols = [f["properties"]["sol"] for f in waypoints]
    dots = ax.scatter(*coordinates.T, c=sols, cmap="viridis", s=22, zorder=3)
    fig.colorbar(dots, ax=ax, label="Curiosity sol (available drive positions)", shrink=0.65)
    if center:
        ax.scatter(*center, marker="*", s=170, c="black", label="AOI center (R0 handoff)")
    ax.set(
        xlabel="East longitude (degrees)",
        ylabel="Planetocentric latitude (degrees)",
        title="R0: native valid-pixel footprints vs Curiosity sols 4534–4805",
    )
    ax.set_aspect(1 / np.cos(np.deg2rad(coordinates[:, 1].mean())))
    ax.grid(alpha=0.2)
    ax.legend(loc="lower left", fontsize=7)
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


def run(raw: Path, output: Path, region: Path, fetch: bool = False) -> dict:
    sources = {
        "MSL_waypoints.json": WAYPOINT_URL,
        **{f"{key}.IMG": value for key, value in PRODUCTS.items()},
    }
    for name, url in sources.items():
        if fetch:
            print(f"Source: {name}", flush=True)
            download(url, raw / name)
        if not (raw / name).is_file():
            raise FileNotFoundError(f"Missing {raw / name}; run with --download")
    waypoints = select_waypoints(json.loads((raw / "MSL_waypoints.json").read_text()))
    rover_coordinates = rover_crs_check(waypoints)
    output.mkdir(parents=True, exist_ok=True)
    results, geometries = [], {}
    for product, url in PRODUCTS.items():
        print(f"Polygonizing {product}", flush=True)
        native, metadata = footprint(raw / f"{product}.IMG")
        crs = CRS.from_wkt(metadata["crs_wkt"])
        to_geo = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
        geographic = transform(to_geo.transform, native)
        geometries[product] = geographic
        results.append(
            {
                "product_id": product,
                "source_url": url,
                **metadata,
                **coverage(geographic, waypoints),
            }
        )
        write_json(
            output / f"{product}_footprint.geojson",
            {
                "type": "Feature",
                "properties": {
                    "product_id": product,
                    "coordinates": COORDINATES,
                    "source_url": url,
                    "method": metadata["method"],
                },
                "geometry": mapping(geographic),
            },
        )
    selected = select_candidate(results)
    center = None
    if selected:
        # Choose an observed campaign position, guaranteed inside valid data.
        center = waypoints[len(waypoints) // 2]["geometry"]["coordinates"][:2]
    checked_at = datetime.now(timezone.utc).isoformat()  # noqa: UP017 (Python 3.10 supported)
    result = {
        "issue": 3,
        "checked_at": checked_at,
        "requested_sol_range": [4534, 4805],
        "available_sol_range": [
            waypoints[0]["properties"]["sol"],
            waypoints[-1]["properties"]["sol"],
        ],
        "rover_source_url": WAYPOINT_URL,
        "coordinates": COORDINATES,
        "rover_crs_check": rover_coordinates,
        "decision": "campaign-covered" if selected else "unresolved",
        "selected_dtm": selected,
        "center_lon_lat": center,
        "candidates": results,
        "inputs": [
            {
                "file": name,
                "url": url,
                "sha256": sha256(raw / name),
                "bytes": (raw / name).stat().st_size,
            }
            for name, url in sources.items()
        ],
        "limitations": [
            "Available drive positions only; no interpolation for unlisted sols.",
            "Coverage is not slope, artifact, co-registration or habitat suitability QA.",
            "MMGIS coordinates checked against PLACES formulas; no surface co-registration QA.",
        ],
    }
    write_json(output / "r0_result.json", result)
    write_json(
        output / "rover_sols4534-4805.geojson",
        {
            "type": "FeatureCollection",
            "source_url": WAYPOINT_URL,
            "coordinates": COORDINATES,
            "features": waypoints,
        },
    )
    # Seed issue #6's config while preserving any subsequent habitat/layer work.
    config = (
        json.loads(region.read_text(encoding="utf-8"))
        if region.exists()
        else {
            "id": "GALE-BX",
            "name": "Gale boxwork campaign",
            "aoi_geojson": None,
            "habitat": None,
            "layers": [],
            "targets": [],
            "params": {},
        }
    )
    chosen = next((r for r in results if r["product_id"] == selected), None)
    config.update(
        {
            "centre_lonlat_E": center,
            "crs_proj": chosen["crs_proj"] if chosen else None,
            "dtm_product_id": selected,
            "r0": {
                "status": result["decision"],
                "coordinates": COORDINATES,
                "coverage_evidence": (output / "r0_result.json").as_posix(),
            },
        }
    )
    write_json(region, config)
    plot_overlay(geometries, waypoints, center, output / "r0_overlay.png")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Fetch ~752 MB of NASA/PDS inputs")
    parser.add_argument("--raw", type=Path, default=Path("data/r0/raw"))
    parser.add_argument("--output", type=Path, default=Path("docs/research/r0"))
    parser.add_argument("--region", type=Path, default=Path("backend/data/gale_bx.json"))
    args = parser.parse_args()
    result = run(args.raw, args.output, args.region, args.download)
    print(json.dumps({k: result[k] for k in ("decision", "selected_dtm", "center_lon_lat")}))
    if result["selected_dtm"] is None:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
