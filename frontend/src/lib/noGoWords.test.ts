import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The words GO and NO-GO are the old status. They stay on the wire (api/types.ts, validate.ts, the
 * mock) for older clients, but nothing a person reads may use them: the interface says EVA readiness.
 */
const UI_DIRS = ["components", "modes", "content", "map", "hud3d"];
const root = new URL("../", import.meta.url);

function files(dir: string): string[] {
  if (!existsSync(new URL(`${dir}/`, root))) return []; // a folder this branch does not have yet
  return readdirSync(new URL(`${dir}/`, root), { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts"))
    .map((e) => `${dir}/${e.name}`);
}

describe("the interface does not use the old status words", () => {
  for (const file of UI_DIRS.flatMap(files)) {
    it(file, () => {
      const text = readFileSync(new URL(file, root), "utf8");
      const hit = text.split("\n").findIndex((line) => /\bNO-GO\b|\bGO\b/.test(line));
      assert.equal(hit, -1, `${file}:${hit + 1} mentions GO or NO-GO`);
    });
  }
});
