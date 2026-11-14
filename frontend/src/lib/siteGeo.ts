import type { GridBbox } from "../api/types.ts";

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
