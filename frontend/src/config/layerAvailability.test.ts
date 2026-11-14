import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { it } from "node:test";
import { availableLayers } from "./layerAvailability.ts";
import { siteFromMeta } from "./site.ts";
import { gridImagesForSite, SITE_GRID_IMAGES } from "./tiles.ts";

const siteFor = (id: string) => siteFromMeta({ site_id: id, name: "Test", preliminary: true, is_test_data: false,
  dtm_product_id: null, cell_m: null, slope_window_m: null,
  center: { lon: 0, lat: 0 }, bbox: { lon_min: -1, lon_max: 1, lat_min: -1, lat_max: 1 }, sources: ["DTM"] });

it("preserves an explicit backend refusal and its reason even for a shipped raster", () => {
  const refusal = { id: "slope" as const, available: false, reason: "Terrain withdrawn", source: null };
  assert.deepEqual(availableLayers(siteFor("gale-bx"), { slope: refusal }).slope, refusal);
});

it("falls back to shipped site imagery when the API has no metadata", () => {
  const info = availableLayers(siteFor("gale-bx"), {});
  assert.equal(info.slope?.available, true);
  assert.equal(info.optical?.available, true);
  assert.equal(info.thermal, undefined);
});

it("does not assume terrain images exist for another site", () => {
  assert.equal(availableLayers(siteFor("missing-site"), {}).slope, undefined);
  assert.deepEqual(gridImagesForSite("missing-site"), {});
});

it("only declares raster files that are bundled for the specified site", () => {
  for (const [site, images] of Object.entries(SITE_GRID_IMAGES)) {
    for (const image of Object.values(images)) {
      assert.ok(existsSync(new URL(`../../public/data/${site}/${image.file}`, import.meta.url)));
    }
  }
});
