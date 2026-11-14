import type { LayerId } from "../api/types.ts";

export interface TileSourceConfig {
  /** XYZ template, for example "https://example.org/tiles/{z}/{x}/{y}.png". Null until a source exists. */
  url: string | null;
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
  tileSize: 256,
  minzoom: 0,
  maxzoom: 18,
  attribution: "",
  opacity,
});

// TODO(team): fill in a tile URL per layer once a source is chosen, and list each one in
// ASSETS.md (URL, license, where used). While `url` is null the map shows the plain dark
// background with a coordinate grid and the layers panel says "Tiles not configured".
export const TILE_SOURCES: Record<LayerId, TileSourceConfig> = {
  optical: unconfigured(1),
  slope: unconfigured(0.65),
  thermal: unconfigured(0.65),
  geology: unconfigured(0.65),
  radiation: unconfigured(0.65),
};
