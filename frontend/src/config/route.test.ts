import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_DISTANCE_FROM_START_M, SLOPE_LIMITS } from "./route.ts";

const data = JSON.parse(readFileSync(new URL("../../../backend/data/gale-bx/assumptions.json", import.meta.url), "utf8"));

test("slope thresholds match the site assumptions", () => {
  assert.equal(SLOPE_LIMITS.cautionDeg, data.slope_caution_deg);
  assert.equal(SLOPE_LIMITS.maxDeg, data.slope_limit_deg);
});

test("max distance from the start matches the site assumptions", () => {
  const item = data.items.find((i: { name: string }) => i.name === "Max distance from lander");
  assert.ok(item, "assumptions.json has a Max distance from lander item");
  assert.equal(`${MAX_DISTANCE_FROM_START_M / 1000} km`, item.value);
});
