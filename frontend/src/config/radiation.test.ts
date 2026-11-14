import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GCR_DOSE_EQUIVALENT_MSV_PER_DAY } from "./radiation.ts";

const data = JSON.parse(readFileSync(new URL("../../../backend/data/gale-bx/assumptions.json", import.meta.url), "utf8"));

test("the dose rate matches the assumption shown to users", () => {
  const item = data.items.find((i: { name: string }) => i.name === "Radiation dose rate");
  assert.ok(item, "assumptions.json has a Radiation dose rate item");
  assert.equal(item.value, `${GCR_DOSE_EQUIVALENT_MSV_PER_DAY} mSv/day`);
  assert.match(item.source, /\[5\]/);
});
