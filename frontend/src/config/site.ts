import type { GridBbox, LonLat, SiteGrid, SiteMeta } from "../api/types.ts";

/** The site the planner opens on. Its grid lives in public/data/<id>/ (docs/DATA_CONTRACT.md). */
export const DEFAULT_SITE_ID = "gale-bx";

export interface SiteConfig {
  id: string;
  name: string;
  lat: number;
  lon: number;
  bbox: GridBbox;
  /** True for generated test grids; the UI shows a "Test data" badge. */
  isTestData: boolean;
  preliminary: boolean;
  sources: readonly string[];
  dtmProductId: string | null;
  cellM: number | null;
  slopeWindowM: number | null;
  /** Geometry for reading slope.bin; null when meta.json has no grid fields. */
  grid: SiteGrid | null;
}

export function siteFromMeta(meta: SiteMeta): SiteConfig {
  return {
    id: meta.site_id,
    name: meta.name,
    lat: meta.center.lat,
    lon: meta.center.lon,
    bbox: meta.bbox,
    isTestData: meta.is_test_data,
    preliminary: meta.preliminary,
    sources: meta.sources,
    dtmProductId: meta.dtm_product_id,
    cellM: meta.cell_m,
    slopeWindowM: meta.slope_window_m,
    grid: meta.grid ?? null,
  };
}

export const siteCentre = (site: SiteConfig): LonLat => [site.lon, site.lat];
