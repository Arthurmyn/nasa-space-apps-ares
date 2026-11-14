import assert from "node:assert/strict";
import { it } from "node:test";
import { availableLayers } from "./layerAvailability.ts";
import { siteFromMeta } from "./site.ts";

it("keeps static terrain imagery usable without the API and when API metadata says unavailable", () => {
  const site = siteFromMeta({ site_id: "test", name: "Test", preliminary: true, is_test_data: false,
    center: { lon: 0, lat: 0 }, bbox: { lon_min: -1, lon_max: 1, lat_min: -1, lat_max: 1 }, sources: ["DTM"] });
  for (const remote of [{}, { slope: { id: "slope" as const, available: false, reason: "API down", source: null } }]) {
    const info = availableLayers(site, remote);
    assert.equal(info.slope?.available, true);
    assert.equal(info.optical?.available, true);
    assert.equal(info.thermal?.available, undefined);
  }
});
