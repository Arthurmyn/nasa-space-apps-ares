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
  { id: "slope", label: "Slope", description: "Slope from HiRISE terrain, ~5 m", isEstimate: false },
  { id: "optical", label: "Optical", description: "HiRISE image, 9 Jul 2008", isEstimate: false },
  { id: "thermal", label: "Thermal inertia", description: "THEMIS, 100 m/px. Not surface temperature", isEstimate: false },
  { id: "radiation", label: "Radiation", description: "Published mean dose, not live", isEstimate: false },
];

/** Layers shown as a card in the panel instead of a map image. The values are for this site only. */
export const CARD_LAYERS: readonly LayerId[] = ["thermal", "radiation"];
export const CARD_LAYERS_SITE_ID = "gale-bx";

/**
 * Short source line shown in the layers panel. The API sends every dataset behind the site,
 * including internal file paths; the full list stays under "How this is computed" and in ASSETS.md.
 */
export const LAYER_SOURCE_LABEL: Partial<Record<LayerId, string>> = {
  optical: "HiRISE orthoimage PSP_009149_1750_RED_C_01_ORTHO, NASA/JPL-Caltech/UArizona; basemap Mars Trek Viking MDIM 2.1 (NASA/JPL)",
  slope: "HiRISE DTM DTEEC_009149_1750_009294_1750_U01, NASA/JPL-Caltech/UArizona",
  thermal: "Fraeman et al. 2016, JGR Planets 121(9):1713-1736, doi:10.1002/2016JE005095, Table 2; NASA/JPL-Caltech/ASU; USGS Astrogeology; Fergason et al. 2006",
  radiation: "Hassler et al. 2014, Science 343, doi:10.1126/science.1244797, Table 1",
};

/** Layers switched on when the app starts. */
export const DEFAULT_ACTIVE_LAYERS: readonly LayerId[] = ["slope", "optical"];

export const NO_DATA_REASON = "No data for this site";
