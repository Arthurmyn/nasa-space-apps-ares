import { useEffect } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { SiteConfig } from "../config/site.ts";
import { drivePathFeatures, relateToBbox } from "../lib/drivePath.ts";
import { boundsOfBbox } from "../lib/siteGeo.ts";
import { drivePathStore, useDrivePath } from "../state/drivePathStore.ts";
import { useUi } from "../state/uiStore.ts";
import { SRC } from "./layers.ts";
import { prefersReducedMotion } from "./theme.ts";

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Draws the full drive path of Curiosity while the overlay is on. When the drive never enters the open site, the
 * map shows the nearest part once: it widens the view just enough to hold the site and that part.
 */
export function useDrivePathLayer(map: MapLibreMap | null, site: SiteConfig): void {
  const { drivePathOn } = useUi();
  const state = useDrivePath();

  useEffect(() => {
    if (drivePathOn) void drivePathStore.load();
  }, [drivePathOn]);

  useEffect(() => {
    const source = map?.getSource(SRC.drivePath) as GeoJSONSource | undefined;
    if (!map || !source) return;
    const shown = drivePathOn && state.status === "ready";
    source.setData(shown ? drivePathFeatures(state.data) : empty);

    if (!shown) return;
    const relation = relateToBbox(state.data.lines, site.bbox);
    if (relation.inside) return;
    const [[w, s], [e, n]] = boundsOfBbox(site.bbox);
    const [lon, lat] = relation.nearest.point;
    map.fitBounds(
      [
        [Math.min(w, lon), Math.min(s, lat)],
        [Math.max(e, lon), Math.max(n, lat)],
      ],
      { padding: 60, duration: prefersReducedMotion() ? 0 : 600 },
    );
  }, [map, drivePathOn, state, site]);
}
