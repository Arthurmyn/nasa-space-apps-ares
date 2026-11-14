"""Reproduce issue #3: exact valid-pixel footprints vs Curiosity sols 4534–4805.

Run from the repository root: python -m scripts.r0_coverage --download
GeoJSON coordinates in this workflow are Mars planetocentric degrees, NOT WGS84.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from itertools import cycle
from pathlib import Path

import matplotlib
import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.features import shapes
from shapely.affinity import affine_transform
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform, unary_union

from scripts.r0_handoff import make_handoff
from scripts.r0_sources import load_inputs
from scripts.r0_waypoints import COORDINATES, MANIFEST, WAYPOINT_URL, select_waypoints

matplotlib.use("Agg")
from matplotlib import pyplot as plt  # noqa: E402


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
            "crs_proj": src.crs.to_proj4().replace("+no_defs=True", "+no_defs"),
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
    inside, outside = [], []
    for feature in waypoints:
        covered = geometry.covers(Point(feature["geometry"]["coordinates"][:2]))
        (inside if covered else outside).append(feature["properties"]["sol"])
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


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    indent = None if path.suffix == ".geojson" else 2
    path.write_bytes((json.dumps(data, indent=indent, allow_nan=False) + "\n").encode("utf-8"))


def plot_overlay(
    geometries: dict,
    waypoints: list[dict],
    center: list | None,
    path: Path,
    aoi: dict | None = None,
):
    fig, ax = plt.subplots(figsize=(10, 9))
    colors = cycle(plt.get_cmap("tab10").colors)
    for product, geometry in geometries.items():
        color = next(colors)
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
    if aoi:
        polygon = shape(aoi)
        polygons = [polygon] if polygon.geom_type == "Polygon" else polygon.geoms
        for part in polygons:
            ax.plot(
                *part.exterior.xy, color="green", linestyle="--", linewidth=1, label="Proposed AOI"
            )
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


def run(
    raw: Path,
    output: Path,
    handoff_path: Path | None = None,
    fetch: bool = False,
    *,
    manifest: Path = MANIFEST,
    verify_inputs: bool = False,
    planning_points: Path | None = None,
    aoi_buffer_m: float = 100,
    planning_approval: Path | None = None,
    retry_source: bool = False,
) -> dict:
    if planning_approval and not planning_points:
        raise ValueError("--planning-approval requires --planning-points")
    handoff_path = handoff_path or output / "gale_bx_handoff.json"
    evidence = Path(
        os.path.relpath((output / "r0_result.json").resolve(), handoff_path.parent.resolve())
    ).as_posix()
    inputs, source_records = load_inputs(
        raw, manifest, fetch=fetch, force=verify_inputs, retry_source=retry_source
    )
    waypoints = select_waypoints(json.loads(inputs.pop("waypoints").read_text(encoding="utf-8")))
    rover_coordinates = rover_crs_check(waypoints)
    output.mkdir(parents=True, exist_ok=True)
    results, geometries, native_geometries = [], {}, {}
    source_urls = {item["file"]: item["url"] for item in source_records}
    source_hashes = {item["file"]: item["sha256"] for item in source_records}
    for product, path in inputs.items():
        url = source_urls[path.name]
        print(f"Polygonizing {product}", flush=True)
        native, metadata = footprint(path)
        native_geometries[product] = native
        crs = CRS.from_wkt(metadata["crs_wkt"])
        to_geo = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
        geographic = transform(to_geo.transform, native)
        geometries[product] = geographic
        results.append(
            {
                "product_id": product,
                "source_url": url,
                "source_sha256": source_hashes[path.name],
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
    center, handoff, aoi = None, None, None
    extra_points = []
    planning_bytes, approval_bytes, points_digest = None, None, None
    approval = None
    if planning_points:
        planning_bytes = planning_points.read_bytes()
        points_digest = hashlib.sha256(planning_bytes).hexdigest()
        collection = json.loads(planning_bytes)
        if collection.get("type") != "FeatureCollection":
            raise ValueError("--planning-points must contain a GeoJSON FeatureCollection of Points")
        extra_points = collection["features"]
        source_records.append(
            {
                "file": planning_points.name,
                "role": "planning-points",
                "sha256": points_digest,
                "bytes": len(planning_bytes),
            }
        )
    if planning_approval:
        approval_bytes = planning_approval.read_bytes()
        approval = json.loads(approval_bytes)
        source_records.append(
            {
                "role": "planning-approval",
                "file": planning_approval.name,
                "sha256": hashlib.sha256(approval_bytes).hexdigest(),
                "bytes": len(approval_bytes),
            }
        )
    if selected:
        chosen = next(r for r in results if r["product_id"] == selected)
        handoff = make_handoff(
            native_geometries[selected],
            chosen,
            waypoints,
            evidence,
            planning_points=extra_points,
            buffer_m=aoi_buffer_m,
            planning_points_sha256=points_digest,
            planning_approval=approval,
        )
        center = handoff["aoi_proposal"]["centre_lonlat_E"]
        aoi = handoff["aoi_proposal"]["aoi_geojson"]
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
        "aoi_proposal": handoff["aoi_proposal"] if handoff else None,
        "candidates": results,
        "inputs": source_records,
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
    if handoff:
        write_json(handoff_path, handoff)
        # Only reconcile artifacts after a successful handoff; failures preserve accepted inputs.
        for name, payload in (
            ("planning_points.geojson", planning_bytes),
            ("planning_approval.json", approval_bytes),
        ):
            artifact = output / name
            if payload is None:
                artifact.unlink(missing_ok=True)
            else:
                artifact.write_bytes(payload)
    plot_overlay(geometries, waypoints, center, output / "r0_overlay.png", aoi)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--download",
        action="store_true",
        help="Fetch ~751 MB of pinned inputs; repair invalid cached rasters",
    )
    parser.add_argument("--raw", type=Path, default=Path("data/r0/raw"))
    parser.add_argument("--output", type=Path, default=Path("docs/research/r0"))
    parser.add_argument(
        "--handoff", type=Path, help="R0 handoff path; default: OUTPUT/gale_bx_handoff.json"
    )
    parser.add_argument("--verify-inputs", action="store_true", help="Rehash all cached rasters")
    parser.add_argument(
        "--retry-source",
        action="store_true",
        help="Explicitly retry a previously rejected source; requires --download",
    )
    parser.add_argument(
        "--planning-approval",
        type=Path,
        help="Review record bound to the exact planning points, AOI and DTM hashes",
    )
    parser.add_argument(
        "--planning-points",
        type=Path,
        help="Mars GeoJSON Points for all finalized R6 targets and D9 habitat",
    )
    parser.add_argument(
        "--aoi-buffer-m",
        type=float,
        default=100,
        help="AOI margin around rover and planning points in native DTM meters",
    )
    args = parser.parse_args()
    if args.retry_source and not args.download:
        parser.error("--retry-source requires --download")
    result = run(
        args.raw,
        args.output,
        args.handoff,
        args.download,
        verify_inputs=args.verify_inputs,
        planning_points=args.planning_points,
        aoi_buffer_m=args.aoi_buffer_m,
        planning_approval=args.planning_approval,
        retry_source=args.retry_source,
    )
    print(json.dumps({k: result[k] for k in ("decision", "selected_dtm", "center_lon_lat")}))
    if result["selected_dtm"] is None:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
