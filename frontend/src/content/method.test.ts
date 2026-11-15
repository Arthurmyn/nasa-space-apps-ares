import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REFERENCES } from "../config/references.ts";
import { fillMethodText, METHOD, type MethodValues } from "./method.ts";

const values: MethodValues = { cellM: "3 m", slopeWindowM: "6 m", cautionDeg: "10°", maxDeg: "15°", dtm: "DTEEC_X" };

describe("the method content", () => {
  it("has the sections the panel promises, in order", () => {
    assert.deepEqual(METHOD.sections.map((s) => s.id), ["terrain", "route", "step-cost", "time", "limits", "radiation", "validation", "limitations"]);
    assert.deepEqual(METHOD.sections.map((s) => s.title), ["Terrain", "Route", "Step cost", "Time", "Limits", "Radiation", "Validation", "Limitations"]);
  });

  it("fills every placeholder it uses", () => {
    for (const s of METHOD.sections) {
      for (const text of [...s.paragraphs, ...(s.bullets ?? [])]) assert.doesNotMatch(fillMethodText(text, values), /\{\w+\}/, `${s.id}: ${text}`);
    }
  });

  it("cites only references that exist", () => {
    const numbers = new Set(REFERENCES.map((r) => r.n));
    for (const s of METHOD.sections) {
      for (const text of [...s.paragraphs, ...(s.bullets ?? [])]) {
        for (const m of text.matchAll(/\[(\d+)\]/g)) assert.ok(numbers.has(Number(m[1])), `${s.id} cites [${m[1]}]`);
      }
    }
  });

  it("never uses the words GO or NO-GO", () => {
    const all = JSON.stringify(METHOD);
    assert.doesNotMatch(all, /\bNO-GO\b|\bGO\b/);
  });

  it("states the cost formula", () => {
    assert.match(METHOD.sections.find((s) => s.id === "step-cost")?.formula ?? "", /length × \(1 \+ k × \(slope ÷ limit\)²\)/);
  });
});

describe("fillMethodText", () => {
  it("replaces known names and leaves an unknown one visible", () => {
    assert.equal(fillMethodText("Cells are {cellM} wide, {nope}.", values), "Cells are 3 m wide, {nope}.");
  });
});
