import type { GridBbox, SiteGrid } from "../api/types.ts";

type Corner = [lon: number, lat: number];

/** The bbox as [[west, south], [east, north]], the shape MapLibre's fitBounds and `bounds` take. */
export function boundsOfBbox(b: GridBbox): [Corner, Corner] {
  return [
    [b.lon_min, b.lat_min],
    [b.lon_max, b.lat_max],
  ];
}

/**
 * Corner order MapLibre expects for an image source: north-west, north-east, south-east,
 * south-west. The PNGs are drawn north up over the bbox (contract section 4).
 */
export function imageCorners(b: GridBbox): [Corner, Corner, Corner, Corner] {
  return [
    [b.lon_min, b.lat_max],
    [b.lon_max, b.lat_max],
    [b.lon_max, b.lat_min],
    [b.lon_min, b.lat_min],
  ];
}

export function insideBbox(b: GridBbox, lon: number, lat: number): boolean {
  return lon >= b.lon_min && lon <= b.lon_max && lat >= b.lat_min && lat <= b.lat_max;
}

/** The nearest point of the box, for a point that was dragged past its edge. */
export function clampToBbox(b: GridBbox, lon: number, lat: number): [lon: number, lat: number] {
  return [Math.min(b.lon_max, Math.max(b.lon_min, lon)), Math.min(b.lat_max, Math.max(b.lat_min, lat))];
}

/**
 * Index into slope.bin / elevation.bin of the cell holding (lon, lat), or null outside the grid.
 * Contract section 4: x = R * rad(lon - lon0) * cos(rad(lat0)), y = R * rad(lat - lat0),
 * col = (x - x_min_m) / cell_m, row = (y_max_m - y) / cell_m, i = row * width + col.
 */
export function gridCellIndex(g: SiteGrid, centre: { lon: number; lat: number }, lon: number, lat: number): number | null {
  const rad = Math.PI / 180;
  const x = g.mars_radius_m * (lon - centre.lon) * rad * Math.cos(centre.lat * rad);
  const y = g.mars_radius_m * (lat - centre.lat) * rad;
  const col = Math.floor((x - g.x_min_m) / g.cell_m);
  const row = Math.floor((g.y_max_m - y) / g.cell_m);
  if (col < 0 || row < 0 || col >= g.width || row >= g.height) return null;
  return row * g.width + col;
}

export type PointCheck = { ok: true } | { ok: false; reason: "outside" | "nodata" | "steep"; message: string };

/** Can a stop go here? Outside the grid, on a DTM gap, or on a cell steeper than the route limit: no. */
export function checkStopPoint(
  g: SiteGrid,
  centre: { lon: number; lat: number },
  slope: Uint8Array,
  maxSlopeDeg: number,
  lon: number,
  lat: number,
): PointCheck {
  const i = gridCellIndex(g, centre, lon, lat);
  const code = i === null ? undefined : slope[i];
  if (code === undefined) return { ok: false, reason: "outside", message: "That point is outside the terrain grid. Click inside the shaded area." };
  if (code === g.slope_nodata) return { ok: false, reason: "nodata", message: "No terrain data at that point (gap in the HiRISE DTM). Pick another point." };
  const deg = code * g.slope_unit_deg;
  if (deg > maxSlopeDeg) {
    return { ok: false, reason: "steep", message: `Slope there is about ${deg.toFixed(1)}°, above the ${maxSlopeDeg}° planning limit. Pick a flatter point.` };
  }
  return { ok: true };
}
