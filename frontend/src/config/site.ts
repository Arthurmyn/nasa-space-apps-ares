import type { GridBbox, LonLat, SiteMeta } from "../api/types.ts";
import { zoomForBbox } from "../lib/siteGeo.ts";

/** The site the planner opens on. Its grid lives in public/data/<id>/ (docs/DATA_CONTRACT.md). */
export const DEFAULT_SITE_ID = "gale-bx";

export interface SiteConfig {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Initial map zoom (512 px tiles), chosen so the whole grid fits. */
  zoom: number;
  bbox: GridBbox;
  /** True for generated test grids; the UI shows a "Test data" badge. */
  isTestData: boolean;
  preliminary: boolean;
  sources: readonly string[];
}

export function siteFromMeta(meta: SiteMeta): SiteConfig {
  return {
    id: meta.site_id,
    name: meta.name,
    lat: meta.center.lat,
    lon: meta.center.lon,
    zoom: zoomForBbox(meta.bbox),
    bbox: meta.bbox,
    isTestData: meta.is_test_data,
    preliminary: meta.preliminary,
    sources: meta.sources,
  };
}

export const siteCentre = (site: SiteConfig): LonLat => [site.lon, site.lat];
