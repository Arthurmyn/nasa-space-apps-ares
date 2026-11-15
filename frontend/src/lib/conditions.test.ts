import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConditionsData } from "../api/types.ts";
import { celsiusRange, remsRows } from "./conditions.ts";

const base: ConditionsData = {
  available: true, provider: "p", disclaimer: "d", source_url: "https://x.org/", sol: 1, earth_date: null, ls_deg: null, season: null,
  air_temp_min_c: -71, air_temp_max_c: -5, ground_temp_min_c: -84, ground_temp_max_c: 4, pressure_pa: 777, pressure_note: "Higher",
  sunrise: "06:46", sunset: "18:51", uv_index: "Moderate", opacity: "Sunny", wind_speed: null, fetched_at: null,
};

describe("celsiusRange", () => {
  it("uses a real minus sign", () => assert.equal(celsiusRange(-71, -5), "−71 to −5 °C"));
  it("shows one end alone, and nothing for no data", () => {
    assert.equal(celsiusRange(null, 4), "4 °C");
    assert.equal(celsiusRange(null, null), null);
  });
});

describe("remsRows", () => {
  it("lists what the feed gave, in order, and skips a missing wind", () => {
    assert.deepEqual(remsRows(base).map((r) => r[0]), ["Air", "Ground", "Pressure", "Sunrise, sunset", "UV index", "Sky"]);
    assert.equal(remsRows(base)[2]?.[1], "777 Pa, higher");
  });
  it("is empty when the feed gave nothing, so the card can hide", () => {
    const none = { ...base, air_temp_min_c: null, air_temp_max_c: null, ground_temp_min_c: null, ground_temp_max_c: null, pressure_pa: null, sunrise: null, sunset: null, uv_index: null, opacity: null };
    assert.deepEqual(remsRows(none), []);
  });
});
