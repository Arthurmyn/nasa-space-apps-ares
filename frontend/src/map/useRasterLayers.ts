import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { LAYER_IDS, type LayerId } from "../api/types.ts";
import { dataSource } from "../api/client.ts";
import { siteFileUrl } from "../api/siteFiles.ts";
import type { SiteConfig } from "../config/site.ts";
import { gridImagesForSite, TILE_SOURCES } from "../config/tiles.ts";
import { imageCorners } from "../lib/siteGeo.ts";
import type { LayersModel } from "../state/PlannerContext.tsx";
import { EQUIRECT_SCHEME, registerEquirectProtocol } from "./equirectProtocol.ts";
import { LYR } from "./layers.ts";

const tileId = (id: LayerId) => `ares-tiles-${id}`;
const imageId = (id: LayerId) => `ares-image-${id}`;

/** Draw order, bottom first. Optical is the base image; the rest are overlays. */
const ORDER: readonly LayerId[] = ["optical", "geology", "thermal", "radiation", "slope"];

/**
 * Add or remove the raster layers of every data layer that is switched on and available:
 * a tile layer when src/config/tiles.ts has a URL, and a grid image (hillshade, slope) placed
 * on the site bbox. Both are drawn under the coordinate grid and the route.
 */
export function useRasterLayers(map: MapLibreMap | null, layers: LayersModel, site: SiteConfig): void {
  const { info, active } = layers;

  useEffect(() => {
    if (!map) return;
    registerEquirectProtocol();

    for (const id of LAYER_IDS) {
      const cfg = TILE_SOURCES[id];
      const wanted = cfg.url !== null && active.has(id) && info[id]?.available === true;
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

      // The dev mock draws a synthetic terrain; the real HiRISE rasters must not sit under it.
      const image = dataSource === "mock" ? undefined : gridImagesForSite(site.id)[id];
      if (!image) continue;
      const imageWanted = active.has(id) && info[id]?.available === true;
      const imagePresent = map.getLayer(imageId(id)) !== undefined;
      if (imageWanted && !imagePresent) {
        map.addSource(imageId(id), { type: "image", url: siteFileUrl(site.id, image.file), coordinates: imageCorners(site.bbox) });
        map.addLayer(
          { id: imageId(id), type: "raster", source: imageId(id), paint: { "raster-opacity": image.opacity, "raster-fade-duration": 0, "raster-resampling": image.resampling ?? "linear" } },
          LYR.grid,
        );
      } else if (!imageWanted && imagePresent) {
        map.removeLayer(imageId(id));
        map.removeSource(imageId(id));
      }
    }

    // Keep the stacking order stable regardless of toggle order.
    for (const id of ORDER) {
      if (map.getLayer(tileId(id))) map.moveLayer(tileId(id), LYR.grid);
      if (map.getLayer(imageId(id))) map.moveLayer(imageId(id), LYR.grid);
    }
  }, [map, info, active, site]);
}
