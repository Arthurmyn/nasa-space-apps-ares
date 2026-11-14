import type { LonLat } from "../api/types.ts";

/**
 * Last known map centre. The map writes it; panels read it for "Add stop at map centre",
 * which gives keyboard users a way to place points without clicking the map.
 */
let centre: LonLat = [0, 0]; // set by SiteProvider once the site metadata is loaded

export const viewportStore = {
  getCentre: (): LonLat => centre,
  setCentre(next: LonLat) {
    centre = next;
  },
};
