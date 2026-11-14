import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildTerrainMesh,
  cellCentre,
  contourInterval,
  decodeElevation,
  elevationRange,
  localToGrid,
  localToLonLat,
  lonLatToLocal,
  meshStride,
  sampleElevation,
  type GridMeta,
} from "./terrain.ts";

const meta: GridMeta = {
  width: 4,
  height: 3,
  cellM: 2,
  xMinM: -4,
  yMaxM: 3,
  radiusM: 3396190,
  centre: { lon: 137.38, lat: -4.8 },
};
// Row 0 is north. Elevation grows to the east (+10 per column) and to the north (+100 per row up).
const elevation = Float32Array.from({ length: 12 }, (_, i) => 10 * (i % 4) + 100 * (2 - Math.floor(i / 4)));

describe("projection", () => {
  it("the site centre is the local origin and round trips", () => {
    const o = lonLatToLocal(meta, meta.centre.lon, meta.centre.lat);
    assert.ok(Math.abs(o.x) < 1e-9 && Math.abs(o.y) < 1e-9);
    const p = localToLonLat(meta, 120, -80);
    const back = lonLatToLocal(meta, p.lon, p.lat);
    assert.ok(Math.abs(back.x - 120) < 1e-6 && Math.abs(back.y + 80) < 1e-6);
  });

  it("north is up the rows and east is along the columns", () => {
    const g = localToGrid(meta, -4, 3);
    assert.deepEqual([g.col, g.row], [0, 0]);
    const c = cellCentre(meta, 1, 1);
    assert.deepEqual([c.x, c.y], [-1, 0]);
  });

  it("the committed grid files describe the projection used by the backend", () => {
    const m = JSON.parse(readFileSync(new URL("../../public/data/gale-bx/meta.json", import.meta.url), "utf8"));
    assert.equal(m.mars_radius_m, 3396190);
    const buf = readFileSync(new URL("../../public/data/gale-bx/elevation.bin", import.meta.url));
    const grid: GridMeta = { width: m.width, height: m.height, cellM: m.cell_m, xMinM: m.x_min_m, yMaxM: m.y_max_m, radiusM: m.mars_radius_m, centre: m.center };
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const z = decodeElevation(arrayBuffer, grid);
    assert.ok(z, "elevation.bin has width * height * 4 bytes");
    const range = elevationRange(z);
    assert.ok(range && range.min > -4000 && range.max < -3000, "Gale boxwork elevations");
    assert.equal(decodeElevation(arrayBuffer.slice(0, 8), grid), null);
  });
});

describe("sampling and mesh", () => {
  it("bilinear sampling hits cell centres and interpolates between them", () => {
    const c = cellCentre(meta, 1, 1);
    assert.equal(sampleElevation(meta, elevation, c.x, c.y), elevation[1 * 4 + 1]);
    const between = sampleElevation(meta, elevation, c.x + 1, c.y); // halfway to column 2
    assert.ok(Math.abs((between ?? 0) - (elevation[5]! + elevation[6]!) / 2) < 1e-9);
  });

  it("is null outside the grid and on no-data", () => {
    assert.equal(sampleElevation(meta, elevation, 500, 0), null);
    const holes = Float32Array.from(elevation);
    holes[5] = Number.NaN;
    const c = cellCentre(meta, 1, 1);
    assert.equal(sampleElevation(meta, holes, c.x, c.y), null);
  });

  it("builds a mesh with the right vertex and triangle counts and puts north at -z", () => {
    const m = buildTerrainMesh(meta, elevation, 1, 0, 0, 2);
    assert.equal(m.positions.length, 12 * 3);
    assert.equal(m.indices.length, (4 - 1) * (3 - 1) * 6);
    assert.ok((m.positions[2] ?? 0) < (m.positions[(8 * 3) + 2] ?? 0), "row 0 (north) has the smallest z");
    assert.equal(m.positions[1], (elevation[0] as number) * 2, "vertical exaggeration x2");
    assert.ok(Math.abs((m.uvs[1] ?? 0) - (1 - 0.5 / 3)) < 1e-6);
  });

  it("no-data cells take the floor elevation", () => {
    const holes = Float32Array.from(elevation);
    holes[0] = Number.NaN;
    const m = buildTerrainMesh(meta, holes, 1, 0, -7, 1);
    assert.equal(m.positions[1], -7);
  });

  it("every index points at an existing vertex", () => {
    const m = buildTerrainMesh(meta, elevation, 2, 0, 0, 1);
    assert.ok(m.indices.every((i) => i < m.positions.length / 3));
  });
});

describe("contours and stride", () => {
  it("picks a nice interval", () => {
    assert.equal(contourInterval(140), 10);
    assert.equal(contourInterval(70), 5);
    assert.equal(contourInterval(36), 2);
    assert.equal(contourInterval(0), 1);
  });

  it("keeps the vertex count under the cap", () => {
    const s = meshStride(317, 431, 40000);
    assert.ok(Math.ceil(317 / s) * Math.ceil(431 / s) <= 40000);
    assert.equal(meshStride(10, 10, 1000), 1);
  });
});
