/**
 * Geometry for reading equirectangular WMTS tiles (plate carree, 2:1 world, origin top-left,
 * rows counted from the top) into Web Mercator tiles, which is what MapLibre draws.
 *
 * Level L of an equirectangular matrix set has 2^(L+1) columns and 2^L rows of 256 px tiles,
 * so level z-1 has the same pixels per degree of longitude as Web Mercator zoom z.
 * Columns therefore line up with Mercator columns; rows do not (Mercator stretches latitude).
 */

export const TILE_PX = 256;

export interface EquirectFootprint {
  /** Source level to read for this Mercator tile. */
  level: number;
  colMin: number;
  colMax: number;
  rowMin: number;
  rowMax: number;
  /** Source x of the tile's left edge, in px from the left edge of column colMin. */
  x0: number;
  /** Source width in px covered by the whole output tile. */
  width: number;
  /**
   * For output row i (0..TILE_PX), source y in px from the top of row rowMin. Has TILE_PX + 1
   * entries: output row i reads source rows rowEdges[i] to rowEdges[i + 1].
   */
  rowEdges: Float64Array;
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Latitude in degrees at a fractional Web Mercator tile row (0 = north edge of the map). */
export function mercatorRowToLat(row: number, z: number): number {
  const n = Math.PI * (1 - (2 * row) / 2 ** z);
  return toDeg(Math.atan(Math.sinh(n)));
}

export function equirectFootprint(z: number, x: number, y: number, maxLevel: number): EquirectFootprint {
  const level = Math.max(0, Math.min(maxLevel, z - 1));
  const pxPerDegLon = (TILE_PX * 2 ** (level + 1)) / 360;
  const pxPerDegLat = (TILE_PX * 2 ** level) / 180;

  const lonW = (x / 2 ** z) * 360 - 180;
  const lonE = ((x + 1) / 2 ** z) * 360 - 180;
  const sx0 = (lonW + 180) * pxPerDegLon;
  const sx1 = (lonE + 180) * pxPerDegLon;

  const maxRow = 2 ** level - 1;
  const maxCol = 2 ** (level + 1) - 1;
  const ys = new Float64Array(TILE_PX + 1);
  for (let i = 0; i <= TILE_PX; i += 1) {
    const lat = mercatorRowToLat(y + i / TILE_PX, z);
    ys[i] = (90 - lat) * pxPerDegLat;
  }

  const colMin = Math.min(maxCol, Math.floor(sx0 / TILE_PX));
  const colMax = Math.min(maxCol, Math.max(colMin, Math.ceil(sx1 / TILE_PX) - 1));
  const rowMin = Math.min(maxRow, Math.floor(ys[0]! / TILE_PX));
  const rowMax = Math.min(maxRow, Math.max(rowMin, Math.ceil(ys[TILE_PX]! / TILE_PX) - 1));

  const rowEdges = new Float64Array(TILE_PX + 1);
  for (let i = 0; i <= TILE_PX; i += 1) rowEdges[i] = ys[i]! - rowMin * TILE_PX;

  return { level, colMin, colMax, rowMin, rowMax, x0: sx0 - colMin * TILE_PX, width: sx1 - sx0, rowEdges };
}
