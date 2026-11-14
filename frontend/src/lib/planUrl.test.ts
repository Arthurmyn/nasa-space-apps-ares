import assert from "node:assert/strict";
import test from "node:test";
import { decodePlan, encodePlan } from "./planUrl.ts";

test("a plan survives a round trip", () => {
  const plan = { start: [137.3828, -4.8032] as const, stops: [[137.381, -4.801] as const, [137.379, -4.806] as const] };
  assert.deepEqual(decodePlan(`#${encodePlan(plan)}`), plan);
});

test("no plan encodes to an empty string", () => {
  assert.equal(encodePlan({ start: null, stops: [] }), "");
});

test("decodePlan drops malformed parts instead of trusting them", () => {
  const plan = decodePlan("#s=abc,def&p=1,2;x;3,95;4,5,6;7,8");
  assert.equal(plan.start, null);
  assert.deepEqual(plan.stops, [[1, 2], [7, 8]]);
});

test("decodePlan keeps at most MAX_STOPS stops", () => {
  const many = Array.from({ length: 9 }, (_, i) => `${i},0`).join(";");
  assert.equal(decodePlan(`#p=${many}`).stops.length, 5);
});

test("decodePlan of an unrelated hash is an empty plan", () => {
  assert.deepEqual(decodePlan("#section-2"), { start: null, stops: [] });
});
