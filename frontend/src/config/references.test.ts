import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REFERENCES } from "./references.ts";

const stops = JSON.parse(readFileSync(new URL("../../../backend/data/gale-bx/stops.json", import.meta.url), "utf8"));

test("every source of the site context is in the Card references", () => {
  for (const source of stops.context.sources) {
    assert.ok(REFERENCES.some((r) => r.url === source.url), `${source.url} is missing from references.ts`);
  }
});

test("the Mount Sharp path image is listed as a design reference only", () => {
  const ref = REFERENCES.find((r) => r.url === "https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/");
  assert.ok(ref);
  assert.equal(ref.design, true);
});

test("reference numbers are 1 to n without gaps", () => {
  assert.deepEqual(REFERENCES.map((r) => r.n), REFERENCES.map((_, i) => i + 1));
});
