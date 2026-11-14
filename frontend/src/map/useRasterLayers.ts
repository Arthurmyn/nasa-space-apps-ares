import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { LAYER_IDS, type LayerId } from "../api/types.ts";
import { TILE_SOURCES } from "../config/tiles.ts";
import type { LayersModel } from "../state/PlannerContext.tsx";
import { EQUIRECT_SCHEME, registerEquirectProtocol } from "./equirectProtocol.ts";
import { LYR } from "./layers.ts";

const tileId = (id: LayerId) => `ares-tiles-${id}`;

/** Draw order, bottom first. Optical is the base image; the rest are overlays. */
const ORDER: readonly LayerId[] = ["optical", "geology", "thermal", "radiation", "slope"];

/**
 * Add or remove one raster layer per data layer that is switched on, available, and has a
 * tile URL in src/config/tiles.ts. With no URL configured nothing is added and the map keeps
 * its plain dark background.
 */
export function useRasterLayers(map: MapLibreMap | null, layers: LayersModel): void {
  const { info, active, status } = layers;

  useEffect(() => {
    if (!map) return;
    registerEquirectProtocol();

    for (const id of LAYER_IDS) {
      const cfg = TILE_SOURCES[id];
      const wanted = status === "ready" && cfg.url !== null && active.has(id) && info[id]?.available === true;
      const present = map.getLayer(tileId(id)) !== undefined;

      if (wanted && !present && cfg.url !== null) {
        map.addSource(tileId(id), {
          type: "raster",
          tiles: [cfg.grid === "wmts-equirect" ? `${EQUIRECT_SCHEME}://${id}/{z}/{x}/{y}` : cfg.url],
          tileSize: cfg.tileSize,
          minzoom: cfg.minzoom,
          maxzoom: cfg.maxzoom,
          attribution: cfg.attribution,
        });
        map.addLayer({ id: tileId(id), type: "raster", source: tileId(id), paint: { "raster-opacity": cfg.opacity } }, LYR.grid);
      } else if (!wanted && present) {
        map.removeLayer(tileId(id));
        map.removeSource(tileId(id));
      }
    }

    // Keep the stacking order stable regardless of toggle order.
    for (const id of ORDER) {
      if (map.getLayer(tileId(id))) map.moveLayer(tileId(id), LYR.grid);
    }
  }, [map, info, active, status]);
}
