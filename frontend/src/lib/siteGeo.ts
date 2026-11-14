import type { GridBbox } from "../api/types.ts";

type Corner = [lon: number, lat: number];

/**
 * Map zoom (512 px tiles) at which the box is `widthPx` wide. Width only: the grid is taller
 * than wide, and the map is wider than tall, so the box then fills the map height comfortably
 * only on large screens; MapLibre's minimum zoom limits keep the result sensible on small ones.
 */
export function zoomForBbox(bbox: GridBbox, widthPx = 700): number {
  const lonSpan = bbox.lon_max - bbox.lon_min;
  return Math.log2((widthPx * 360) / (lonSpan * 512));
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
