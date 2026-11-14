export interface SiteConfig {
  name: string;
  lat: number;
  lon: number;
  /** Initial map zoom (512px tiles). */
  zoom: number;
}

// TODO(team): PLACEHOLDER. Replace with the real landing/exploration site, its
// coordinates and a sensible start zoom. 0/0 is not a chosen site; it only keeps the map valid.
export const SITE: SiteConfig = {
  name: "Site not configured",
  lat: 0,
  lon: 0,
  zoom: 13,
};

export const SITE_IS_PLACEHOLDER = true;
