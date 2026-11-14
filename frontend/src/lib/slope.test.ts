import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySlope, worstClass } from "./slope.ts";

// Test-local limits: independent of the placeholder values in src/config/route.ts.
const limits = { cautionDeg: 8, maxDeg: 14 } as const;

describe("classifySlope", () => {
  it("is ok up to and including the caution limit", () => {
    assert.equal(classifySlope(0, limits), "ok");
    assert.equal(classifySlope(8, limits), "ok");
  });
  it("is caution between the caution and max limits", () => {
    assert.equal(classifySlope(8.01, limits), "caution");
    assert.equal(classifySlope(14, limits), "caution");
  });
  it("is avoid above the max limit", () => {
    assert.equal(classifySlope(14.01, limits), "avoid");
  });
  it("uses the absolute value", () => {
    assert.equal(classifySlope(-10, limits), "caution");
  });
  it("treats non-finite slopes as avoid", () => {
    assert.equal(classifySlope(Number.NaN, limits), "avoid");
    assert.equal(classifySlope(Number.POSITIVE_INFINITY, limits), "avoid");
  });
});

describe("worstClass", () => {
  it("returns the more severe class", () => {
    assert.equal(worstClass("ok", "caution"), "caution");
    assert.equal(worstClass("avoid", "caution"), "avoid");
    assert.equal(worstClass("ok", "ok"), "ok");
  });
});
