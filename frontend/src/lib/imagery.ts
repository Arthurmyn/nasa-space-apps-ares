import { EQ_SOURCES, type EqSourceId } from "../config/tiles.ts";
import { metresPerPixelAtLevel } from "./equirect.ts";
import { MARS_RADIUS_M } from "./geo.ts";

/** "10 m/px", "2.5 m/px", "0.64 m/px". */
export function formatResolution(metres: number): string {
  if (!Number.isFinite(metres) || metres <= 0) return "–";
  const text = metres >= 10 ? metres.toFixed(0) : metres >= 1 ? metres.toFixed(1) : metres.toFixed(2);
  return `${text} m/px`;
}

export interface ImageryRow {
  id: EqSourceId;
  name: string;
  /** Ground size of a pixel at the deepest level the server has, from the layer's tile matrix. */
  resolution: string;
  /** Where it is drawn, in words. */
  coverage: string;
  url: string;
}

const NAMES: Record<EqSourceId, { name: string; coverage: string; page: string }> = {
  optical: { name: "Viking MDIM 2.1", coverage: "whole planet, always underneath", page: "https://trek.nasa.gov/mars/" },
  ctx: { name: "CTX", coverage: "around Gale crater, from zoom 8", page: "https://trek.nasa.gov/mars/" },
  hirise: { name: "HiRISE mosaic", coverage: "around the Curiosity site, from zoom 13", page: "https://trek.nasa.gov/mars/" },
};

/**
 * The lines of the imagery legend. The resolution is computed from each layer's deepest level (its tile
 * matrix in the WMTS capabilities, kept in config/tiles.ts), never typed in. Viking is the exception:
 * its tile levels stop at 325 m/px, and its 232 m/px is the mosaic's own, stated by the product.
 */
export function imageryRows(): ImageryRow[] {
  return (Object.keys(NAMES) as EqSourceId[]).map((id) => {
    const cfg = EQ_SOURCES[id];
    return {
      id,
      name: NAMES[id].name,
      resolution: id === "optical" ? formatResolution(232) : formatResolution(metresPerPixelAtLevel(cfg.maxLevel, MARS_RADIUS_M)),
      coverage: NAMES[id].coverage,
      url: NAMES[id].page,
    };
  });
}

export const IMAGERY_CREDIT = "NASA/JPL-Caltech, Mars Trek";
