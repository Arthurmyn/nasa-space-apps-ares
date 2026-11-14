import { useEffect, useState } from "react";
import type { Feature } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { boundsOf, gridLines, gridStepDeg, metresPerPixel, type GridLines } from "../lib/geo.ts";
import { SRC } from "./layers.ts";

export interface GridModel {
  lines: GridLines;
  stepDeg: number;
  /** Metres per screen pixel at the view centre. */
  metresPerPx: number;
  centre: { lng: number; lat: number };
}

function compute(map: MapLibreMap): GridModel | null {
  const b = map.getBounds();
  const bounds = boundsOf([
    [b.getWest(), b.getSouth()],
    [b.getEast(), b.getNorth()],
  ]);
  if (!bounds) return null;
  const stepDeg = gridStepDeg(bounds);
  const centre = map.getCenter();
  return {
    lines: gridLines(bounds, stepDeg),
    stepDeg,
    metresPerPx: metresPerPixel(centre.lat, map.getZoom()),
    centre: { lng: centre.lng, lat: centre.lat },
  };
}

/**
 * Coordinate grid that follows the view: spacing is a round number of metres (on Mars), lines
 * are written to the map source, and the same model feeds the edge ticks and the scale bar.
 * Updates are limited to one per animation frame.
 */
export function useGridModel(map: MapLibreMap | null): GridModel | null {
  const [model, setModel] = useState<GridModel | null>(null);

  useEffect(() => {
    if (!map) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      const next = compute(map);
      if (!next) return;
      const b = map.getBounds();
      const features: Feature[] = [
        ...next.lines.lons.map((lon) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates: [[lon, b.getSouth()], [lon, b.getNorth()]] },
        })),
        ...next.lines.lats.map((lat) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates: [[b.getWest(), lat], [b.getEast(), lat]] },
        })),
      ];
      map.getSource<GeoJSONSource>(SRC.grid)?.setData({ type: "FeatureCollection", features });
      setModel(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    map.on("move", schedule);
    map.on("resize", schedule);
    return () => {
      map.off("move", schedule);
      map.off("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [map]);

  return model;
}
