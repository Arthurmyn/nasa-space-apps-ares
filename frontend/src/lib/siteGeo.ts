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
