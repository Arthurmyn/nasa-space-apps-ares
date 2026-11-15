import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { LAYER_IDS, type LayerId } from "../api/types.ts";
import { dataSource } from "../api/client.ts";
import { siteFileUrl, siteImageryUrl } from "../api/siteFiles.ts";
import type { SiteConfig } from "../config/site.ts";
import { EQ_SOURCES, gridImagesForSite, IMAGERY_STACK, TILE_SOURCES } from "../config/tiles.ts";
import { useUi } from "../state/uiStore.ts";
import { imageCorners } from "../lib/siteGeo.ts";
import type { LayersModel } from "../state/PlannerContext.tsx";
import { EQUIRECT_SCHEME, registerEquirectProtocol } from "./equirectProtocol.ts";
import { LYR } from "./layers.ts";

const tileId = (id: LayerId) => `ares-tiles-${id}`;
const imageId = (id: LayerId) => `ares-image-${id}`;
const imageryId = (id: (typeof IMAGERY_STACK)[number]) => `ares-imagery-${id}`;

/** Draw order, bottom first. Optical is the base image; the rest are overlays. */
const ORDER: readonly LayerId[] = ["optical", "geology", "thermal", "radiation", "slope"];

/**
 * Bottom to top, each just under the coordinate grid: the Viking basemap, the CTX and HiRISE mosaic
 * imagery, the site's own optical image, then the other data layers (slope last). Called after any
 * layer is added, so the order never depends on which switch was flipped first.
 */
function restack(map: MapLibreMap): void {
  const order: string[] = [tileId("optical"), ...IMAGERY_STACK.map(imageryId), imageId("optical")];
  for (const id of ORDER) {
    if (id !== "optical") order.push(tileId(id), imageId(id));
  }
  for (const id of order) {
    if (map.getLayer(id)) map.moveLayer(id, LYR.grid);
  }
}

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
        const url = image.dir === "imagery" ? siteImageryUrl(site.id, image.file) : siteFileUrl(site.id, image.file);
        map.addSource(imageId(id), { type: "image", url, coordinates: imageCorners(site.bbox) });
        map.addLayer(
          { id: imageId(id), type: "raster", source: imageId(id), paint: { "raster-opacity": image.opacity, "raster-fade-duration": 0, "raster-resampling": image.resampling ?? "linear" } },
          LYR.grid,
        );
      } else if (!imageWanted && imagePresent) {
        map.removeLayer(imageId(id));
        map.removeSource(imageId(id));
      }
    }

    restack(map);
  }, [map, info, active, site]);
}

/**
 * The Mars Trek CTX and HiRISE mosaic imagery above the Viking basemap, switched together. Each
 * source only asks for tiles inside its own coverage box (config/tiles.ts), and only from the zoom
 * where it is finer than the layer under it, so there is nothing to fail outside them and the layer
 * below shows through everywhere else.
 */
export function useTrekImagery(map: MapLibreMap | null): void {
  const { imageryOn } = useUi();

  useEffect(() => {
    if (!map) return;
    registerEquirectProtocol();
    for (const id of IMAGERY_STACK) {
      const cfg = EQ_SOURCES[id];
      const present = map.getLayer(imageryId(id)) !== undefined;
      if (imageryOn && !present && cfg.url !== null) {
        map.addSource(imageryId(id), {
          type: "raster",
          tiles: [`${EQUIRECT_SCHEME}://${id}/{z}/{x}/{y}`],
          tileSize: cfg.tileSize,
          minzoom: cfg.minzoom,
          maxzoom: cfg.maxzoom,
          attribution: cfg.attribution,
          ...(cfg.bounds ? { bounds: [...cfg.bounds] as [number, number, number, number] } : {}),
        });
        map.addLayer(
          { id: imageryId(id), type: "raster", source: imageryId(id), minzoom: cfg.minzoom, paint: { "raster-opacity": cfg.opacity, "raster-fade-duration": 0 } },
          LYR.grid,
        );
      } else if (!imageryOn && present) {
        map.removeLayer(imageryId(id));
        map.removeSource(imageryId(id));
      }
    }
    restack(map);
  }, [map, imageryOn]);
}
