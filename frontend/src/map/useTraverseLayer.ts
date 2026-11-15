import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";
import { Popup, type GeoJSONSource, type Map as MapLibreMap, type MapLayerMouseEvent } from "maplibre-gl";
import type { SiteConfig } from "../config/site.ts";
import { slopeAt, traverseTooltip, type TraverseStop } from "../lib/traverse.ts";
import { LYR, SRC } from "./layers.ts";

interface TraverseInput {
  stops: readonly TraverseStop[] | null;
  on: boolean;
  site: SiteConfig;
  slope: Uint8Array | null;
}

/** Curiosity's traverse: a dashed line through the stops in drive order and a dot per stop. */
export function useTraverseLayer(map: MapLibreMap | null, { stops, on, site, slope }: TraverseInput): void {
  useEffect(() => {
    if (!map) return;
    const list = stops ?? [];
    const line: FeatureCollection = {
      type: "FeatureCollection",
      features:
        list.length > 1
          ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: list.map((s) => [s.lon, s.lat]) } }]
          : [],
    };
    const points: FeatureCollection = {
      type: "FeatureCollection",
      features: list.map((s, i) => ({ type: "Feature", properties: { i }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })),
    };
    map.getSource<GeoJSONSource>(SRC.traverseLine)?.setData(line);
    map.getSource<GeoJSONSource>(SRC.traverseStops)?.setData(points);
  }, [map, stops]);

  useEffect(() => {
    if (!map) return;
    const visibility = on && stops ? "visible" : "none";
    for (const id of [LYR.traverseLine, LYR.traverseStops]) map.setLayoutProperty(id, "visibility", visibility);
  }, [map, on, stops]);

  // Hover (and tap, for touch screens) on a stop shows sol, rover tilt and our slope there.
  const latest = useRef({ stops, site, slope });
  latest.current = { stops, site, slope };
  const popupRef = useRef<Popup | null>(null);
  useEffect(() => {
    if (!map) return;
    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 8, className: "traverse-tip", maxWidth: "none" });
    popupRef.current = popup;
    const canvas = map.getCanvas();

    const show = (e: MapLayerMouseEvent) => {
      const { stops: list, site: s, slope: bin } = latest.current;
      const i = e.features?.[0]?.properties?.i;
      const stop = typeof i === "number" ? list?.[i] : undefined;
      if (!stop) return;
      const slopeDeg = s.grid ? slopeAt(s.grid, { lon: s.lon, lat: s.lat }, bin, stop.lon, stop.lat) : null;
      canvas.style.cursor = "pointer";
      popup.setLngLat([stop.lon, stop.lat]).setText(traverseTooltip(stop, slopeDeg)).addTo(map);
    };
    const hide = () => {
      canvas.style.cursor = "";
      popup.remove();
    };

    map.on("mousemove", LYR.traverseStops, show);
    map.on("click", LYR.traverseStops, show);
    map.on("mouseleave", LYR.traverseStops, hide);
    return () => {
      map.off("mousemove", LYR.traverseStops, show);
      map.off("click", LYR.traverseStops, show);
      map.off("mouseleave", LYR.traverseStops, hide);
      hide();
      popupRef.current = null;
    };
  }, [map]);

  // Hide a tooltip left open when the layer is switched off.
  useEffect(() => {
    if (on) return;
    popupRef.current?.remove();
    if (map) map.getCanvas().style.cursor = "";
  }, [map, on]);
}
