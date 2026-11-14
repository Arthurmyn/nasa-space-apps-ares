import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCoordinates,
  formatDistance,
  formatDuration,
  formatSigned,
  formatSlope,
  formatUtcTime,
  stopLabel,
} from "./format.ts";

const nb = (s: string) => s.replace(/ /g, " ");

describe("formatDistance", () => {
  it("uses metres below 1 km", () => {
    assert.equal(formatDistance(340), nb("340 m"));
    assert.equal(formatDistance(999.4), nb("999 m"));
  });
  it("uses km with 2 decimals up to 10 km, then 1", () => {
    assert.equal(formatDistance(4860), nb("4.86 km"));
    assert.equal(formatDistance(12_400), nb("12.4 km"));
  });
  it("returns a dash for non-finite input", () => {
    assert.equal(formatDistance(Number.NaN), "–");
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    assert.equal(formatDuration(3 * 3600 + 42 * 60), nb("3 h 42 min"));
  });
  it("omits hours under one hour", () => {
    assert.equal(formatDuration(54 * 60), nb("54 min"));
  });
  it("handles sub-minute and invalid values", () => {
    assert.equal(formatDuration(20), nb("< 1 min"));
    assert.equal(formatDuration(-5), "–");
  });
  it("rolls 59.6 minutes over to 1 h 0 min", () => {
    assert.equal(formatDuration(59.6 * 60), nb("1 h 0 min"));
  });
});

describe("formatSlope", () => {
  it("shows one decimal and a degree sign", () => {
    assert.equal(formatSlope(12.43), "12.4°");
  });
});

describe("formatCoordinates", () => {
  it("adds hemisphere letters", () => {
    assert.equal(formatCoordinates(18.3814, 77.5342), `${nb("18.3814° N")}, ${nb("77.5342° E")}`);
    assert.equal(formatCoordinates(-4.5, -120.25, 2), `${nb("4.50° S")}, ${nb("120.25° W")}`);
  });
});

describe("stopLabel", () => {
  it("counts A, B, C and continues past Z", () => {
    assert.equal(stopLabel(0), "A");
    assert.equal(stopLabel(4), "E");
    assert.equal(stopLabel(25), "Z");
    assert.equal(stopLabel(26), "AA");
  });
});

describe("formatUtcTime", () => {
  it("formats an ISO timestamp as UTC", () => {
    assert.equal(formatUtcTime("2030-01-01T14:32:05Z"), nb("14:32:05 UTC"));
  });
  it("returns null for garbage", () => {
    assert.equal(formatUtcTime("not a date"), null);
  });
});

describe("formatSigned", () => {
  it("prefixes + or a true minus", () => {
    assert.equal(formatSigned(1200, formatDistance), `+${nb("1.20 km")}`);
    assert.equal(formatSigned(-180, formatDistance), `−${nb("180 m")}`);
    assert.equal(formatSigned(0, formatDistance), nb("0 m"));
  });
});
