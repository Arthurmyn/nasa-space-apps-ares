import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampOffset, nextSnap, settle, snapOffsets, stepSnap } from "./sheet.ts";

const offsets = snapOffsets(600, 96); // peek 504, half 300, full 0

describe("snapOffsets", () => {
  it("puts peek just above the bottom, half in the middle and full at the top", () => {
    assert.deepEqual(offsets, { peek: 504, half: 300, full: 0 });
  });
  it("never lets half sit lower than peek on a tiny screen", () => {
    assert.deepEqual(snapOffsets(150, 96), { peek: 54, half: 54, full: 0 });
  });
});

describe("settle", () => {
  it("stays on the nearest snap after a slow drag", () => {
    assert.equal(settle(320, 0, offsets), "half");
    assert.equal(settle(100, 0, offsets), "full");
    assert.equal(settle(450, 0, offsets), "peek");
  });
  it("lets a flick carry past the nearest snap", () => {
    assert.equal(settle(320, -1400, offsets), "full"); // upward flick from near half
    assert.equal(settle(300, 1400, offsets), "peek"); // downward flick from half
  });
  it("ignores a tiny velocity", () => {
    assert.equal(settle(300, 20, offsets), "half");
  });
});

describe("keyboard steps", () => {
  it("cycles with Enter", () => {
    assert.deepEqual(["peek", "half", "full"].map((s) => nextSnap(s as "peek")), ["half", "full", "peek"]);
  });
  it("steps with the arrows and stops at the ends", () => {
    assert.equal(stepSnap("peek", -1), "half");
    assert.equal(stepSnap("half", -1), "full");
    assert.equal(stepSnap("full", -1), "full");
    assert.equal(stepSnap("full", 1), "half");
    assert.equal(stepSnap("peek", 1), "peek");
  });
});

describe("clampOffset", () => {
  it("keeps a drag between fully open and peek", () => {
    assert.equal(clampOffset(-40, offsets), 0);
    assert.equal(clampOffset(700, offsets), 504);
    assert.equal(clampOffset(250, offsets), 250);
  });
});
