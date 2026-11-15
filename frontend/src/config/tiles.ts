import type { LayerId } from "../api/types.ts";

export interface TileSourceConfig {
  /**
   * Tile URL template, or null until a source exists.
   * `grid: "xyz"`: Web Mercator, for example "https://example.org/tiles/{z}/{x}/{y}.png".
   * `grid: "wmts-equirect"`: WMTS plate carree grid, template order {z}/{y}/{x} = level/row/column,
   * rows counted from the top (not TMS). The map reprojects these tiles to Web Mercator.
   */
  url: string | null;
  grid: "xyz" | "wmts-equirect";
  /** Deepest level the server has tiles for. Only used by "wmts-equirect". */
  maxLevel: number;
  tileSize: 256 | 512;
  minzoom: number;
  maxzoom: number;
  /** Shown in the map attribution. Required by most tile providers. */
  attribution: string;
  /** Layer opacity, 0 to 1. The optical layer is the base image; the others are overlays. */
  opacity: number;
  /**
   * West, south, east, north in degrees: the coverage of a layer that is not global. Tiles outside it
   * are never requested (the server answers 404 there, without CORS headers, so the request would
   * only fail). Null for a global layer.
   */
  bounds: readonly [west: number, south: number, east: number, north: number] | null;
}

const unconfigured = (opacity: number): TileSourceConfig => ({
  url: null,
  grid: "xyz",
  maxLevel: 0,
  tileSize: 256,
  minzoom: 0,
  maxzoom: 18,
  attribution: "",
  opacity,
  bounds: null,
});

/**
 * Mars Trek, Viking MDIM 2.1 colour mosaic, global, 232 m/px. WMTS GetCapabilities (checked):
 * EPSG:104905 equirectangular, matrix set default028mm, 256 px tiles, levels 0 to 7
 * (2 x 1 tiles at level 0, doubling each level), bbox -180 -90 180 90, JPEG, top-left origin.
 * Tiles outside coverage return 404; the loader treats that as transparent, not an error.
 * MapLibre zoom 8 reads level 7, so maxzoom is 8 and deeper zoom is overzoomed.
 * Source: https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml
 */
const MARS_TREK_VIKING: TileSourceConfig = {
  url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg",
  grid: "wmts-equirect",
  maxLevel: 7,
  tileSize: 256,
  minzoom: 0,
  maxzoom: 8,
  attribution: "NASA/JPL, Mars Trek (Viking MDIM 2.1)",
  opacity: 1,
  bounds: null,
};

/**
 * Mars Trek, CTX context mosaic of the Gale area (Gale_CTX_BlockAdj_dd). WMTS GetCapabilities
 * (read 15 Nov 2026): the same EPSG:104905 grid and matrix set default028mm as Viking, 256 px tiles,
 * PNG, levels 0 to 12, bbox 135.1842593 -6.5732988 139.2413012 -2.8077809. Level 12 is the deepest
 * the server has: 8192 x 4096 tiles, about 10.18 m per pixel at the equator (2 pi R / (256 x 2^13)).
 * The capabilities do not state the source pixel size; CTX is nominally about 6 m per pixel, so the
 * finest level served is a little coarser than the camera's own. It starts at map zoom 8, where its level is as fine as Viking's deepest one.
 * Source: https://trek.nasa.gov/tiles/Mars/EQ/Gale_CTX_BlockAdj_dd/1.0.0/WMTSCapabilities.xml
 */
const MARS_TREK_CTX: TileSourceConfig = {
  url: "https://trek.nasa.gov/tiles/Mars/EQ/Gale_CTX_BlockAdj_dd/1.0.0//default/default028mm/{z}/{y}/{x}.png",
  grid: "wmts-equirect",
  maxLevel: 12,
  tileSize: 256,
  minzoom: 8,
  maxzoom: 13,
  attribution: "NASA/JPL-Caltech, Mars Trek (CTX)",
  opacity: 1,
  bounds: [135.1842593, -6.5732988, 139.2413012, -2.8077809],
};

/**
 * Mars Trek, HiRISE mosaic of the Curiosity site (curiosity_hirise_mosaic). WMTS GetCapabilities
 * (read 15 Nov 2026): the same grid and matrix set, PNG, levels 0 to 16, bbox 137.1224669 -4.9254743
 * 137.7298129 -4.2489588. Level 16 is the deepest: 131072 x 65536 tiles, about 0.64 m per pixel at
 * the equator (2 pi R / (256 x 2^17)). It starts at map zoom 13, where its level (10.18 m per pixel)
 * is as fine as the CTX layer's deepest one.
 * Source: https://trek.nasa.gov/tiles/Mars/EQ/curiosity_hirise_mosaic/1.0.0/WMTSCapabilities.xml
 */
const MARS_TREK_HIRISE: TileSourceConfig = {
  url: "https://trek.nasa.gov/tiles/Mars/EQ/curiosity_hirise_mosaic/1.0.0//default/default028mm/{z}/{y}/{x}.png",
  grid: "wmts-equirect",
  maxLevel: 16,
  tileSize: 256,
  minzoom: 13,
  maxzoom: 17,
  attribution: "NASA/JPL-Caltech/University of Arizona, Mars Trek (HiRISE mosaic)",
  opacity: 1,
  bounds: [137.1224669, -4.9254743, 137.7298129, -4.2489588],
};

/** Ids of the Mars Trek tile sets the equirectangular loader can read. "optical" is the Viking basemap. */
export type EqSourceId = "optical" | "ctx" | "hirise";

// TODO(team): fill in a tile URL for the other layers once a source is chosen, and list each
// one in ASSETS.md (URL, license, where used). While `url` is null the map draws nothing for
// that layer and the layers panel says "Tiles not configured".
export const TILE_SOURCES: Record<LayerId, TileSourceConfig> = {
  optical: MARS_TREK_VIKING,
  slope: unconfigured(0.65),
  thermal: unconfigured(0.65),
  geology: unconfigured(0.65),
  radiation: unconfigured(0.65),
};

/** Every Mars Trek tile set read through the equirectangular loader (src/map/equirectProtocol.ts). */
export const EQ_SOURCES: Record<EqSourceId, TileSourceConfig> = {
  optical: MARS_TREK_VIKING,
  ctx: MARS_TREK_CTX,
  hirise: MARS_TREK_HIRISE,
};

/** The high-resolution imagery drawn above Viking, lowest first. Switched on and off together. */
export const IMAGERY_STACK: readonly Exclude<EqSourceId, "optical">[] = ["ctx", "hirise"];

/**
 * Layers drawn from a PNG that the grid script writes next to meta.json (docs/DATA_CONTRACT.md,
 * section 2). The PNG covers the site bbox, north up. "optical" is the HiRISE orthoimage of the
 * DTM stereo pair (scripts/make_optical_layer.py), placed on the same bbox over the Mars Trek basemap.
 */
export interface GridImageConfig {
  file: string;
  /** "imagery": public/imagery/<site>/ (large images outside the grid budget); default public/data/<site>/. */
  dir?: "data" | "imagery";
  opacity: number;
  /** "nearest" keeps coarse source pixels as blocks instead of smoothing them into fake detail. */
  resampling?: "nearest" | "linear";
}

/** Explicit inventory of bundled assets, scoped to the site that owns their bbox. */
const GRID_LAYER_IMAGES: Partial<Record<LayerId, GridImageConfig>> = {
  optical: { file: "hillshade.png", opacity: 0.6 },
  slope: { file: "slope.png", opacity: 0.8 },
  // THEMIS, 100 m per pixel: drawn as blocks (see scripts/make_thermal_layer.py).
  thermal: { file: "thermal.png", opacity: 0.75, resampling: "nearest" },
};

export const SITE_GRID_IMAGES: Record<string, Partial<Record<LayerId, GridImageConfig>>> = {
  "gale-bx": {
    optical: { file: "optical.jpg", dir: "imagery", opacity: 1 },
    slope: { file: "slope.png", opacity: 0.8 },
    // No thermal image: the only raster at hand is THEMIS daytime IR brightness, which is not
    // thermal inertia. The thermal layer shows the published value as a card instead.
  },
  "gale-001488": GRID_LAYER_IMAGES,
};

export const gridImagesForSite = (siteId: string): Partial<Record<LayerId, GridImageConfig>> => SITE_GRID_IMAGES[siteId] ?? {};

/** True when the layer has some image source, either tiles or a grid PNG. */
export const layerHasImagery = (id: LayerId, siteId: string): boolean => TILE_SOURCES[id].url !== null || gridImagesForSite(siteId)[id] !== undefined;
