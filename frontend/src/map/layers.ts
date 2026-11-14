import type { FeatureCollection } from "geojson";
import type { LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { MapTheme } from "./theme.ts";

// Source and layer ids used across the map modules.
export const SRC = {
  grid: "ares-grid",
  route: "ares-route",
  routeSlope: "ares-route-slope",
  alt: "ares-alt",
  hazards: "ares-hazards",
} as const;

export const LYR = {
  grid: "ares-grid-lines",
  hazardFill: "ares-hazard-fill",
  hazardLine: "ares-hazard-line",
  alt: "ares-alt-line",
  routeCasing: "ares-route-casing",
  route: "ares-route-line",
  slopeOk: "ares-slope-ok",
  slopeCaution: "ares-slope-caution",
  slopeAvoid: "ares-slope-avoid",
} as const;

export const HATCH_IMAGE = "ares-hatch";

/** Plain dark background. No glyphs or sprites are needed because labels are DOM elements. */
export function baseStyle(theme: MapTheme): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": theme.bg } }],
  };
}

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Hatch pattern for hazard fills: thin diagonal lines, drawn at runtime (no image asset). */
function createHatch(color: string): { width: number; height: number; data: Uint8ClampedArray } {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available for the hazard hatch pattern");
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "square";
  ctx.beginPath();
  // Three segments so the diagonal tiles without visible seams.
  ctx.moveTo(-2, size + 2);
  ctx.lineTo(size + 2, -2);
  ctx.moveTo(-2, 2);
  ctx.lineTo(2, -2);
  ctx.moveTo(size - 2, size + 2);
  ctx.lineTo(size + 2, size - 2);
  ctx.stroke();
  const { width, height, data } = ctx.getImageData(0, 0, size, size);
  return { width, height, data };
}

/** Add every ARES source and layer. Call once after the style has loaded. */
export function addAresLayers(map: MapLibreMap, theme: MapTheme): void {
  map.addImage(HATCH_IMAGE, createHatch(theme.hazard), { pixelRatio: 2 });

  for (const id of Object.values(SRC)) {
    map.addSource(id, { type: "geojson", data: empty });
  }

  const layers: LayerSpecification[] = [
    {
      id: LYR.grid,
      type: "line",
      source: SRC.grid,
      paint: { "line-color": theme.lineStrong, "line-width": 1, "line-opacity": 0.7 },
    },
    {
      id: LYR.hazardFill,
      type: "fill",
      source: SRC.hazards,
      paint: { "fill-pattern": HATCH_IMAGE, "fill-opacity": 0.55 },
    },
    {
      id: LYR.hazardLine,
      type: "line",
      source: SRC.hazards,
      paint: { "line-color": theme.hazard, "line-width": 2, "line-dasharray": [3, 2] },
    },
    {
      id: LYR.alt,
      type: "line",
      source: SRC.alt,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.muted, "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.9 },
    },
    {
      id: LYR.routeCasing,
      type: "line",
      source: SRC.route,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.bg, "line-width": 9, "line-opacity": 0.85 },
    },
    {
      id: LYR.route,
      type: "line",
      source: SRC.route,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": theme.accent, "line-width": 5 },
    },
    // Thin class-coloured centre line, shown only while the Slope layer is on. Dash style
    // differs per class so the information is not carried by colour alone.
    slopeLayer(LYR.slopeOk, "ok", theme.classOk, undefined),
    slopeLayer(LYR.slopeCaution, "caution", theme.classCaution, [3, 1.5]),
    slopeLayer(LYR.slopeAvoid, "avoid", theme.classAvoid, [1, 1.5]),
  ];
  for (const layer of layers) map.addLayer(layer);
}

function slopeLayer(id: string, cls: string, color: string, dash: number[] | undefined): LayerSpecification {
  return {
    id,
    type: "line",
    source: SRC.routeSlope,
    filter: ["==", ["get", "cls"], cls],
    layout: { "line-cap": "butt", "line-join": "round", visibility: "none" },
    paint: { "line-color": color, "line-width": 2, ...(dash ? { "line-dasharray": dash } : {}) },
  };
}
