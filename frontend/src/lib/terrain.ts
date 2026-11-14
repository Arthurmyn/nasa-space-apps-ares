/**
 * Terrain grid helpers for the 3D HUD. The grid and its projection are defined in
 * docs/DATA_CONTRACT.md, section 4: a local equidistant projection around the site centre,
 * row 0 is north, values are elevations in metres at the cell centres.
 */

export interface GridMeta {
  width: number;
  height: number;
  cellM: number;
  /** x of the west edge and y of the north edge, metres from the site centre. */
  xMinM: number;
  yMaxM: number;
  radiusM: number;
  centre: { lon: number; lat: number };
}

const RAD = Math.PI / 180;

/** Metres east and north of the site centre for a longitude and latitude (contract section 4). */
export function lonLatToLocal(meta: GridMeta, lon: number, lat: number): { x: number; y: number } {
  return {
    x: meta.radiusM * (lon - meta.centre.lon) * RAD * Math.cos(meta.centre.lat * RAD),
    y: meta.radiusM * (lat - meta.centre.lat) * RAD,
  };
}

/** Local metres (east, north) back to longitude and latitude. */
export function localToLonLat(meta: GridMeta, x: number, y: number): { lon: number; lat: number } {
  return {
    lon: meta.centre.lon + x / (meta.radiusM * Math.cos(meta.centre.lat * RAD) * RAD),
    lat: meta.centre.lat + y / (meta.radiusM * RAD),
  };
}

/** Fractional column and row of a local position; the centre of cell (c, r) is at (c + 0.5, r + 0.5). */
export function localToGrid(meta: GridMeta, x: number, y: number): { col: number; row: number } {
  return { col: (x - meta.xMinM) / meta.cellM, row: (meta.yMaxM - y) / meta.cellM };
}

/** Local metres of the centre of cell (col, row). */
export function cellCentre(meta: GridMeta, col: number, row: number): { x: number; y: number } {
  return { x: meta.xMinM + (col + 0.5) * meta.cellM, y: meta.yMaxM - (row + 0.5) * meta.cellM };
}

/** Elevation at a local position, bilinear between cell centres. Null outside the grid or on no-data. */
export function sampleElevation(meta: GridMeta, elevation: Float32Array, x: number, y: number): number | null {
  const { col, row } = localToGrid(meta, x, y);
  const c = col - 0.5;
  const r = row - 0.5;
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  if (c0 < 0 || r0 < 0 || c0 + 1 >= meta.width || r0 + 1 >= meta.height) return null;
  const fc = c - c0;
  const fr = r - r0;
  const at = (cc: number, rr: number) => elevation[rr * meta.width + cc] as number;
  const v00 = at(c0, r0);
  const v10 = at(c0 + 1, r0);
  const v01 = at(c0, r0 + 1);
  const v11 = at(c0 + 1, r0 + 1);
  if (![v00, v10, v01, v11].every(Number.isFinite)) return null;
  return v00 * (1 - fc) * (1 - fr) + v10 * fc * (1 - fr) + v01 * (1 - fc) * fr + v11 * fc * fr;
}

export interface ElevationRange {
  min: number;
  max: number;
  /** Mean of the valid cells; the 3D scene subtracts it so coordinates stay small. */
  mean: number;
}

export function elevationRange(elevation: Float32Array): ElevationRange | null {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (const v of elevation) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    n += 1;
  }
  return n === 0 ? null : { min, max, mean: sum / n };
}

export interface TerrainMesh {
  /** x east, y up, z south (so that north is "into the screen"), in metres; y is elevation minus `baseM`, times `exaggeration`. */
  positions: Float32Array;
  /** Texture coordinates; v is 1 at the north edge. */
  uvs: Float32Array;
  indices: Uint32Array;
  columns: number;
  rows: number;
}

/**
 * A grid mesh with every `step`-th cell centre as a vertex. No-data cells take the lowest valid
 * elevation, so the edge of the data is a flat floor and not a spike.
 */
export function buildTerrainMesh(
  meta: GridMeta,
  elevation: Float32Array,
  step: number,
  baseM: number,
  floorM: number,
  exaggeration: number,
): TerrainMesh {
  const stride = Math.max(1, Math.floor(step));
  const columns = Math.ceil(meta.width / stride);
  const rows = Math.ceil(meta.height / stride);
  const positions = new Float32Array(columns * rows * 3);
  const uvs = new Float32Array(columns * rows * 2);
  for (let r = 0; r < rows; r += 1) {
    const row = Math.min(meta.height - 1, r * stride);
    for (let c = 0; c < columns; c += 1) {
      const col = Math.min(meta.width - 1, c * stride);
      const z = elevation[row * meta.width + col] as number;
      const { x, y } = cellCentre(meta, col, row);
      const i = r * columns + c;
      positions[i * 3] = x;
      positions[i * 3 + 1] = ((Number.isFinite(z) ? z : floorM) - baseM) * exaggeration;
      positions[i * 3 + 2] = -y;
      uvs[i * 2] = (col + 0.5) / meta.width;
      uvs[i * 2 + 1] = 1 - (row + 0.5) / meta.height;
    }
  }
  const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < columns - 1; c += 1) {
      const a = r * columns + c;
      const b = a + 1;
      const d = a + columns;
      const e = d + 1;
      indices[k++] = a;
      indices[k++] = d;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = e;
    }
  }
  return { positions, uvs, indices, columns, rows };
}

/** A contour interval of 1, 2, 5, 10, ... metres that gives roughly `lines` lines over `rangeM`. */
export function contourInterval(rangeM: number, lines = 18): number {
  if (!(rangeM > 0)) return 1;
  const raw = rangeM / lines;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const nice = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return nice * pow;
}

/** Vertex stride that keeps a mesh near `maxVertices` (the 3D view must stay light on phones). */
export function meshStride(width: number, height: number, maxVertices: number): number {
  let stride = 1;
  while (Math.ceil(width / stride) * Math.ceil(height / stride) > maxVertices) stride += 1;
  return stride;
}

/** Decode a little-endian Float32 file into an array of width * height values, or null if the size is wrong. */
export function decodeElevation(buffer: ArrayBuffer, meta: GridMeta): Float32Array | null {
  if (buffer.byteLength !== meta.width * meta.height * 4) return null;
  const view = new DataView(buffer);
  const out = new Float32Array(meta.width * meta.height);
  for (let i = 0; i < out.length; i += 1) out[i] = view.getFloat32(i * 4, true);
  return out;
}
