import type { LayerId } from "../api/types.ts";

export interface LayerMeta {
  id: LayerId;
  label: string;
  /** One line, shown under the label. */
  description: string;
  /** True for a modelled value that must be labelled as an estimate. */
  isEstimate: boolean;
}

export const LAYER_META: readonly LayerMeta[] = [
  { id: "slope", label: "Slope", description: "Terrain steepness in degrees", isEstimate: false },
  { id: "optical", label: "Optical", description: "Terrain shading from the HiRISE DTM over Viking imagery", isEstimate: false },
  { id: "thermal", label: "Thermal", description: "THEMIS infrared, snapshot, 100 m per pixel, coarse at this site", isEstimate: false },
  { id: "geology", label: "Geology", description: "Mapped rock and terrain units", isEstimate: false },
  { id: "radiation", label: "Radiation", description: "One measured dose rate for the whole site, shown in the route summary", isEstimate: false },
];

/**
 * Short source line shown in the layers panel. The API sends every dataset behind the site,
 * including internal file paths; the full list stays under "How this is computed" and in ASSETS.md.
 */
export const LAYER_SOURCE_LABEL: Partial<Record<LayerId, string>> = {
  optical: "HiRISE DTM (NASA/JPL/University of Arizona) + Mars Trek (NASA/JPL)",
  slope: "HiRISE DTM (NASA/JPL/University of Arizona)",
  thermal: "THEMIS, Mars Odyssey (NASA/ASU), via USGS Astrogeology",
};

/** Layers switched on when the app starts. */
export const DEFAULT_ACTIVE_LAYERS: readonly LayerId[] = ["slope", "optical"];

export const NO_DATA_REASON = "No data for this site";
