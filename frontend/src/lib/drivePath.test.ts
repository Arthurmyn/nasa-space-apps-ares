import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { GridBbox } from "../api/types.ts";
import { parseDrivePath, relateToBbox, drivePathFeatures } from "./drivePath.ts";

const doc = (coordinates: unknown) => ({
  type: "FeatureCollection",
  ares: { schema: "ares.traverse/v1", source: { title: "T", url: "https://example.org/x", fetched_utc: "2026-11-15T00:00:00Z" } },
  features: [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates } }],
});
const box: GridBbox = { lon_min: 10, lon_max: 10.1, lat_min: 5, lat_max: 5.1 };

describe("parseDrivePath", () => {
  it("reads the lines and the source", () => {
    const t = parseDrivePath(doc([[[10.01, 5.01], [10.02, 5.02]]]));
    assert.deepEqual(t.lines, [[[10.01, 5.01], [10.02, 5.02]]]);
    assert.deepEqual(t.source, { title: "T", url: "https://example.org/x", fetchedUtc: "2026-11-15T00:00:00Z" });
  });
  it("refuses a file that is not the contract", () => {
    assert.throws(() => parseDrivePath({}), /ares.traverse/);
    assert.throws(() => parseDrivePath({ ...doc([]), ares: { schema: "other" } }), /ares.traverse/);
    assert.throws(() => parseDrivePath(doc([])), /no lines/);
    assert.throws(() => parseDrivePath(doc([[[1, 2]]])), /fewer than 2/);
    assert.throws(() => parseDrivePath(doc([[[1, 2], [3, 95]]])), /not a \[lon, lat\]/);
  });
  it("drops a source link that is not http(s)", () => {
    const d = doc([[[1, 2], [3, 4]]]) as { ares: { source: { url: string } } };
    d.ares.source.url = "javascript:alert(1)";
    assert.equal(parseDrivePath(d).source.url, "");
  });
});

describe("relateToBbox", () => {
  it("is inside when a vertex lies in the box", () => {
    const r = relateToBbox([[[9, 5.05], [10.05, 5.05]]], box);
    assert.equal(r.inside, true);
    assert.equal(r.nearest.distanceM, 0);
  });
  it("gives the nearest vertex and its distance when the line stays out", () => {
    const r = relateToBbox([[[10.3, 5.05], [10.5, 5.05]]], box);
    assert.equal(r.inside, false);
    assert.deepEqual(r.nearest.point, [10.3, 5.05]);
    // 0.2 deg of longitude on the Mars sphere at 5 deg north is about 11.8 km
    assert.ok(Math.abs(r.nearest.distanceM - 11_800) < 300, String(r.nearest.distanceM));
  });
});

describe("the committed msl_traverse.json", () => {
  const raw: unknown = JSON.parse(readFileSync(new URL("../../public/data/msl_traverse.json", import.meta.url), "utf8"));
  const t = parseDrivePath(raw);
  it("parses and is small enough to ship", () => {
    assert.ok(t.lines.length > 0);
    assert.ok(readFileSync(new URL("../../public/data/msl_traverse.json", import.meta.url)).length < 150_000);
  });
  it("enters the first site and not the second, as the data says", () => {
    const meta = (id: string) => JSON.parse(readFileSync(new URL(`../../public/data/${id}/meta.json`, import.meta.url), "utf8")).bbox as GridBbox;
    assert.equal(relateToBbox(t.lines, meta("gale-bx")).inside, true);
    const other = relateToBbox(t.lines, meta("gale-001488"));
    assert.equal(other.inside, false);
    assert.ok(other.nearest.distanceM > 1000 && other.nearest.distanceM < 20_000, String(other.nearest.distanceM));
  });
  it("converts to one feature", () => assert.equal(drivePathFeatures(t).features.length, 1));
});
