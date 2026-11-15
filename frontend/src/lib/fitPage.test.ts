import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fitScale, MIN_FIT, stillOverflows } from "./fitPage.ts";

describe("fitScale", () => {
  it("leaves content that fits alone", () => {
    assert.equal(fitScale(900, 1123), 1);
    assert.equal(fitScale(1123, 1123), 1);
  });
  it("shrinks content that overflows just enough, rounded down", () => {
    assert.equal(fitScale(1212, 1123), 0.926);
    assert.ok(1212 * fitScale(1212, 1123) <= 1123);
    assert.ok(1141 * fitScale(1141, 1123) <= 1123);
  });
  it("never goes below the smallest readable scale", () => {
    assert.equal(fitScale(5000, 1123), MIN_FIT);
  });
  it("ignores nonsense", () => {
    assert.equal(fitScale(Number.NaN, 1123), 1);
    assert.equal(fitScale(1500, 0), 1);
  });
  it("says when even the smallest scale is not enough", () => {
    assert.equal(stillOverflows(1500, 1123), false);
    assert.equal(stillOverflows(1700, 1123), true);
  });
});
