import { SITE } from "../config/site.ts";
import type { LonLat } from "../api/types.ts";

/**
 * Last known map centre. The map writes it; panels read it for "Add stop at map centre",
 * which gives keyboard users a way to place points without clicking the map.
 */
let centre: LonLat = [SITE.lon, SITE.lat];

export const viewportStore = {
  getCentre: (): LonLat => centre,
  setCentre(next: LonLat) {
    centre = next;
  },
};
