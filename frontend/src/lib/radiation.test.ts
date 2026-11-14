import assert from "node:assert/strict";
import test from "node:test";
import { estimatedDoseMsv, formatDose } from "./radiation.ts";

test("a whole day at the rate gives the rate", () => {
  assert.equal(estimatedDoseMsv(0.67, 86400), 0.67);
});

test("dose is rate times time over 86400 s", () => {
  // 2 hours at 0.67 mSv per day.
  assert.ok(Math.abs((estimatedDoseMsv(0.67, 7200) ?? NaN) - 0.67 / 12) < 1e-12);
  assert.equal(estimatedDoseMsv(0.67, 0), 0);
});

test("bad inputs give null, not a number that looks real", () => {
  assert.equal(estimatedDoseMsv(Number.NaN, 100), null);
  assert.equal(estimatedDoseMsv(0.67, -1), null);
  assert.equal(estimatedDoseMsv(-0.1, 100), null);
  assert.equal(estimatedDoseMsv(0.67, Number.POSITIVE_INFINITY), null);
});

test("formatDose uses microsieverts for small values", () => {
  assert.equal(formatDose(0.0163), "16 µSv");
  assert.equal(formatDose(0.25), "0.25 mSv");
  assert.equal(formatDose(null), "–");
});
