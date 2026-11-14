import type { LayerId, LayerInfo } from "../api/types.ts";
import { CARD_LAYERS, CARD_LAYERS_SITE_ID, LAYER_SOURCE_LABEL } from "./layers.ts";
import type { SiteConfig } from "./site.ts";
import { layerHasImagery } from "./tiles.ts";

/** Fall back to known imagery only when the backend has no entry for the layer. */
export function availableLayers(site: SiteConfig, remote: Partial<Record<LayerId, LayerInfo>>): Partial<Record<LayerId, LayerInfo>> {
  const info = { ...remote };
  for (const id of ["slope", "optical"] as const) {
    if (remote[id] || !layerHasImagery(id, site.id)) continue;
    info[id] = { id, available: true, reason: null, source: site.sources.join("; ") };
  }
  // Card layers show a published value or a note, so they are always available. Their source line
  // comes from the verified facts, not from the backend (whose thermal entry is THEMIS daytime IR).
  if (site.id !== CARD_LAYERS_SITE_ID) return info;
  for (const id of CARD_LAYERS) {
    info[id] = { id, available: true, reason: null, source: LAYER_SOURCE_LABEL[id] ?? null };
  }
  return info;
}
