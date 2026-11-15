import { addProtocol } from "maplibre-gl";
import { EQ_SOURCES, type EqSourceId } from "../config/tiles.ts";
import { boxesOverlap, eqTileBounds, equirectFootprint, TILE_PX } from "../lib/equirect.ts";

/** Custom tile scheme: `ares-eq://<sourceId>/<z>/<x>/<y>` with Web Mercator z/x/y; the id is a key of EQ_SOURCES. */
export const EQUIRECT_SCHEME = "ares-eq";

const fill = (template: string, z: number, row: number, col: number) =>
  template.replace("{z}", String(z)).replace("{y}", String(row)).replace("{x}", String(col));

/**
 * Fetch one source tile. 404 means "no coverage here" and yields null. For a layer with a coverage
 * box (`soft`), a tile that cannot be read at all (the server's 404 carries no CORS header, so the
 * browser reports it as a failed request) is also "no coverage": the overlay is left transparent there
 * and the layer below shows. A cancelled request is never turned into a missing tile.
 */
async function fetchTile(url: string, signal: AbortSignal, soft: boolean): Promise<ImageBitmap | null> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (soft && !signal.aborted) return null;
    throw e;
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Tile request failed (${res.status}): ${url}`);
  return createImageBitmap(await res.blob());
}

async function loadEquirectTile(layer: EqSourceId, z: number, x: number, y: number, signal: AbortSignal): Promise<ImageBitmap> {
  const cfg = EQ_SOURCES[layer];
  if (cfg.url === null) throw new Error(`No tile URL configured for layer ${layer}`);
  const fp = equirectFootprint(z, x, y, cfg.maxLevel);

  const cols = fp.colMax - fp.colMin + 1;
  const rows = fp.rowMax - fp.rowMin + 1;
  const mosaic = new OffscreenCanvas(cols * TILE_PX, rows * TILE_PX);
  const mctx = mosaic.getContext("2d");
  const out = new OffscreenCanvas(TILE_PX, TILE_PX);
  const octx = out.getContext("2d");
  if (!mctx || !octx) throw new Error("2D canvas is not available");

  const jobs: Promise<void>[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const row = fp.rowMin + r;
      const col = fp.colMin + c;
      // A source tile outside the layer's coverage is not asked for: it can only be a 404.
      if (cfg.bounds && !boxesOverlap(eqTileBounds(fp.level, row, col), cfg.bounds)) continue;
      const url = fill(cfg.url, fp.level, row, col);
      jobs.push(
        fetchTile(url, signal, cfg.bounds !== null).then((bmp) => {
          if (bmp) {
            mctx.drawImage(bmp, c * TILE_PX, r * TILE_PX);
            bmp.close();
          }
        }),
      );
    }
  }
  await Promise.all(jobs);

  // Latitude is stretched differently in the two grids, so copy row by row. Longitude is linear
  // in both, so each row is a single horizontal scale.
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "medium";
  for (let i = 0; i < TILE_PX; i += 1) {
    const sy = fp.rowEdges[i]!;
    const sh = Math.max(fp.rowEdges[i + 1]! - sy, 1e-3);
    octx.drawImage(mosaic, fp.x0, sy, fp.width, sh, 0, i, TILE_PX, 1);
  }
  return out.transferToImageBitmap();
}

let registered = false;

/** Register the loader once. Safe to call from every map instance. */
export function registerEquirectProtocol(): void {
  if (registered) return;
  registered = true;
  addProtocol(EQUIRECT_SCHEME, async (params, abort) => {
    const m = /^ares-eq:\/\/([a-z]+)\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
    if (!m || !(m[1]! in EQ_SOURCES)) throw new Error(`Bad equirect tile URL: ${params.url}`);
    const data = await loadEquirectTile(m[1] as EqSourceId, Number(m[2]), Number(m[3]), Number(m[4]), abort.signal);
    return { data };
  });
}
