import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LAYER_META } from "./layers.ts";

const thermal = JSON.parse(readFileSync(new URL("../../public/data/gale-bx/thermal.json", import.meta.url), "utf8"));
const description = (id: string) => LAYER_META.find((l) => l.id === id)?.description ?? "";

test("the thermal description states the pixel size of the data file", () => {
  assert.equal(thermal.native_pixel_m, 100);
  assert.match(description("thermal"), new RegExp(`${thermal.native_pixel_m} m per pixel`));
  assert.match(description("thermal"), /snapshot/);
});

test("radiation is not an estimate map and says it is one value", () => {
  const radiation = LAYER_META.find((l) => l.id === "radiation");
  assert.equal(radiation?.isEstimate, false);
  assert.match(radiation?.description ?? "", /whole site/);
});
