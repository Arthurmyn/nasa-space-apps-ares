import type { LayerId, LayerInfo } from "../api/types.ts";
import type { SiteConfig } from "./site.ts";
import { layerHasImagery } from "./tiles.ts";

/** Fall back to known imagery only when the backend has no entry for the layer. */
export function availableLayers(site: SiteConfig, remote: Partial<Record<LayerId, LayerInfo>>): Partial<Record<LayerId, LayerInfo>> {
  const info = { ...remote };
  for (const id of ["slope", "optical"] as const) {
    if (remote[id] || !layerHasImagery(id, site.id)) continue;
    info[id] = { id, available: true, reason: null, source: site.sources.join("; ") };
  }
  return info;
}
