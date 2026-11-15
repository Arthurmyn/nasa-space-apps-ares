import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boxesOverlap, eqTileBounds, metresPerPixelAtLevel } from "../lib/equirect.ts";
import { formatResolution, imageryRows } from "../lib/imagery.ts";
import { MARS_RADIUS_M } from "../lib/geo.ts";
import { EQ_SOURCES, IMAGERY_STACK, SITE_GRID_IMAGES } from "./tiles.ts";

describe("the Mars Trek tile sets", () => {
  for (const id of ["optical", "ctx", "hirise"] as const) {
    const cfg = EQ_SOURCES[id];
    it(`${id}: same grid and protocol as Viking, PNG or JPEG, 256 px tiles`, () => {
      assert.equal(cfg.grid, "wmts-equirect");
      assert.equal(cfg.tileSize, 256);
      assert.match(cfg.url ?? "", /^https:\/\/trek\.nasa\.gov\/tiles\/Mars\/EQ\/.+\/1\.0\.0\/\/default\/default028mm\/\{z\}\/\{y\}\/\{x\}\.(png|jpg)$/);
    });
    it(`${id}: MapLibre reads one zoom more than the deepest level`, () => assert.equal(cfg.maxzoom, cfg.maxLevel + 1));
    it(`${id}: is credited`, () => assert.ok(cfg.attribution.length > 0));
  }

  it("CTX and HiRISE are the layers of the capabilities, with their levels and boxes", () => {
    assert.match(EQ_SOURCES.ctx.url ?? "", /Gale_CTX_BlockAdj_dd.+\.png$/);
    assert.equal(EQ_SOURCES.ctx.maxLevel, 12);
    assert.deepEqual(EQ_SOURCES.ctx.bounds, [135.1842593, -6.5732988, 139.2413012, -2.8077809]);
    assert.match(EQ_SOURCES.hirise.url ?? "", /curiosity_hirise_mosaic.+\.png$/);
    assert.equal(EQ_SOURCES.hirise.maxLevel, 16);
    assert.deepEqual(EQ_SOURCES.hirise.bounds, [137.1224669, -4.9254743, 137.7298129, -4.2489588]);
    assert.equal(EQ_SOURCES.optical.bounds, null, "Viking is global");
  });

  it("stacks from coarse to fine, each starting where it beats the one below", () => {
    assert.deepEqual(IMAGERY_STACK, ["ctx", "hirise"]);
    assert.ok(EQ_SOURCES.ctx.minzoom >= EQ_SOURCES.optical.maxzoom, "CTX starts where Viking's levels end");
    assert.ok(EQ_SOURCES.hirise.minzoom >= EQ_SOURCES.ctx.maxzoom, "HiRISE starts where CTX's levels end");
    assert.ok(EQ_SOURCES.hirise.minzoom > EQ_SOURCES.ctx.minzoom);
  });

  it("both cover every shipped site", () => {
    const meta = (id: string) => JSON.parse(readSiteMeta(id)).bbox as { lon_min: number; lon_max: number; lat_min: number; lat_max: number };
    for (const id of Object.keys(SITE_GRID_IMAGES)) {
      const b = meta(id);
      for (const key of ["ctx", "hirise"] as const) {
        const [w, s, e, n] = EQ_SOURCES[key].bounds!;
        assert.ok(b.lon_min >= w && b.lon_max <= e && b.lat_min >= s && b.lat_max <= n, `${key} covers ${id}`);
      }
    }
  });
});

import { readFileSync } from "node:fs";
const readSiteMeta = (id: string) => readFileSync(new URL(`../../public/data/${id}/meta.json`, import.meta.url), "utf8");

describe("the tile geometry the loader uses to skip tiles that cannot exist", () => {
  it("gives the box of a tile, rows from the top", () => {
    assert.deepEqual(eqTileBounds(0, 0, 0), [-180, -90, 0, 90]); // level 0 is 2 x 1 tiles
    assert.deepEqual(eqTileBounds(0, 0, 1), [0, -90, 180, 90]);
    assert.deepEqual(eqTileBounds(1, 0, 0), [-180, 0, -90, 90]);
    assert.deepEqual(eqTileBounds(1, 1, 3), [90, -90, 180, 0]);
  });

  it("the tile that holds the site is inside the HiRISE box, and one far away is not", () => {
    const level = 12;
    const col = Math.floor(((137.3873 + 180) / 360) * 2 ** (level + 1));
    const row = Math.floor(((90 + 4.79575) / 180) * 2 ** level);
    assert.ok(boxesOverlap(eqTileBounds(level, row, col), EQ_SOURCES.hirise.bounds!));
    assert.equal(boxesOverlap(eqTileBounds(level, row, col + 200), EQ_SOURCES.hirise.bounds!), false);
    assert.equal(boxesOverlap(eqTileBounds(level, row + 100, col), EQ_SOURCES.ctx.bounds!), false);
  });

  it("boxes that only touch do not overlap", () => {
    assert.equal(boxesOverlap([0, 0, 1, 1], [1, 0, 2, 1]), false);
    assert.equal(boxesOverlap([0, 0, 1, 1], [0.5, 0.5, 2, 2]), true);
  });
});

describe("resolution shown in the panel", () => {
  it("is the ground pixel of the deepest level, from the tile matrix", () => {
    assert.ok(Math.abs(metresPerPixelAtLevel(12, MARS_RADIUS_M) - 10.18) < 0.01);
    assert.ok(Math.abs(metresPerPixelAtLevel(16, MARS_RADIUS_M) - 0.636) < 0.01);
    assert.ok(Math.abs(metresPerPixelAtLevel(7, MARS_RADIUS_M) - 325.6) < 0.1);
  });
  it("is formatted without false precision", () => {
    assert.equal(formatResolution(10.18), "10 m/px");
    assert.equal(formatResolution(2.54), "2.5 m/px");
    assert.equal(formatResolution(0.636), "0.64 m/px");
    assert.equal(formatResolution(Number.NaN), "–");
  });
  it("lists the three layers, the two new ones with computed values", () => {
    const rows = imageryRows();
    assert.deepEqual(rows.map((r) => r.id), ["optical", "ctx", "hirise"]);
    assert.equal(rows.find((r) => r.id === "ctx")?.resolution, "10 m/px");
    assert.equal(rows.find((r) => r.id === "hirise")?.resolution, "0.64 m/px");
  });
});
