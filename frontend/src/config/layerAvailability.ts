import type { LayerId, LayerInfo } from "../api/types.ts";
import type { SiteConfig } from "./site.ts";
import { GRID_IMAGES, TILE_SOURCES } from "./tiles.ts";

/** Static grid assets belong to the loaded site, independently of API availability. */
export function availableLayers(site: SiteConfig, remote: Partial<Record<LayerId, LayerInfo>>): Partial<Record<LayerId, LayerInfo>> {
  const info = { ...remote };
  for (const id of ["slope", "optical"] as const) {
    if (!GRID_IMAGES[id] && !TILE_SOURCES[id].url) continue;
    info[id] = { id, available: true, reason: null, source: remote[id]?.source ?? site.sources.join("; ") };
  }
  return info;
}
