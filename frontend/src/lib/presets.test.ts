import assert from "node:assert/strict";
import test from "node:test";
import { groupTargets } from "./presets.ts";

const stop = (id: string, lon: number) => ({ id, name: `Target ${id}`, lon, lat: -4.8, note: null, image: null, source_id: null });
const site = { stops: [stop("a", 1), stop("b", 2), stop("c", 3)] };

test("groupTargets keeps the group order", () => {
  assert.deepEqual(
    groupTargets(site, { stop_ids: ["c", "a"] }).map((s) => s.name),
    ["Target c", "Target a"],
  );
});

test("groupTargets skips unknown and repeated ids", () => {
  assert.equal(groupTargets(site, { stop_ids: ["a", "zzz", "a", "b"] }).length, 2);
});

test("groupTargets returns an empty list for an empty group", () => {
  assert.deepEqual(groupTargets(site, { stop_ids: [] }), []);
});
