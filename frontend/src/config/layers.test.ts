import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LAYER_META } from "./layers.ts";
import { GCR_DOSE_EQUIVALENT_MSV_PER_DAY, GCR_DOSE_EQUIVALENT_SIGMA_MSV_PER_DAY } from "./radiation.ts";

// Verified labels and values (ares_layers/facts/site_facts.json). The UI must use them verbatim.
const facts = JSON.parse(readFileSync(new URL("../../../ares_layers/facts/site_facts.json", import.meta.url), "utf8"));
const meta = (id: string) => LAYER_META.find((l) => l.id === id);

test("layer descriptions are the verified labels, word for word", () => {
  for (const id of ["slope", "optical", "thermal"] as const) {
    assert.equal(meta(id)?.description, facts.layers[id].label, id);
  }
  assert.equal(meta("radiation")?.description, facts.layers.radiation.label);
});

test("thermal is called thermal inertia, never surface temperature", () => {
  assert.equal(meta("thermal")?.label, "Thermal inertia");
  assert.match(meta("thermal")?.description ?? "", /NOT surface temperature/);
});

test("radiation is a published mean, not live, and matches the verified rate", () => {
  assert.equal(meta("radiation")?.isEstimate, false);
  assert.match(meta("radiation")?.description ?? "", /published mean, not live/);
  assert.equal(`${GCR_DOSE_EQUIVALENT_MSV_PER_DAY} ± ${GCR_DOSE_EQUIVALENT_SIGMA_MSV_PER_DAY}`, facts.layers.radiation.dose_equivalent_mSv_per_day);
});

test("no layer text calls anything live or safe", () => {
  for (const l of LAYER_META) {
    assert.doesNotMatch(l.description, /\breal-time\b|\bsafe\b|guarantee/i, l.id);
    assert.doesNotMatch(l.description.replace("not live", ""), /\blive\b/i, l.id);
  }
});
