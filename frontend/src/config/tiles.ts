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
};

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

/**
 * Layers drawn from a PNG that the grid script writes next to meta.json (docs/DATA_CONTRACT.md,
 * section 2). The PNG covers the site bbox, north up. "optical" is the hillshade, drawn over the
 * Mars Trek basemap with some transparency so the basemap still shows through.
 */
export interface GridImageConfig {
  file: string;
  opacity: number;
  /** "nearest" keeps coarse source pixels as blocks instead of smoothing them into fake detail. */
  resampling?: "nearest" | "linear";
}

/** Explicit inventory of bundled assets, scoped to the site that owns their bbox. */
export const SITE_GRID_IMAGES: Record<string, Partial<Record<LayerId, GridImageConfig>>> = {
  "gale-bx": {
    optical: { file: "hillshade.png", opacity: 0.6 },
    slope: { file: "slope.png", opacity: 0.8 },
    // THEMIS, 100 m per pixel: drawn as blocks (see scripts/make_thermal_layer.py).
    thermal: { file: "thermal.png", opacity: 0.75, resampling: "nearest" },
  },
};

export const gridImagesForSite = (siteId: string): Partial<Record<LayerId, GridImageConfig>> => SITE_GRID_IMAGES[siteId] ?? {};

/** True when the layer has some image source, either tiles or a grid PNG. */
export const layerHasImagery = (id: LayerId, siteId: string): boolean => TILE_SOURCES[id].url !== null || gridImagesForSite(siteId)[id] !== undefined;
