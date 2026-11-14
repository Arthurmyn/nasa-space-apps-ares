import assert from "node:assert/strict";
import test from "node:test";
import { uiStore } from "./uiStore.ts";

test("togglePanel folds and unfolds each side on its own", () => {
  assert.equal(uiStore.get().leftCollapsed, false);
  uiStore.togglePanel("left");
  assert.deepEqual([uiStore.get().leftCollapsed, uiStore.get().rightCollapsed], [true, false]);
  uiStore.togglePanel("right");
  assert.deepEqual([uiStore.get().leftCollapsed, uiStore.get().rightCollapsed], [true, true]);
  uiStore.togglePanel("left");
  uiStore.togglePanel("right");
  assert.deepEqual([uiStore.get().leftCollapsed, uiStore.get().rightCollapsed], [false, false]);
});

test("subscribers are told once per real change", () => {
  let calls = 0;
  const off = uiStore.subscribe(() => (calls += 1));
  uiStore.setHowComputedOpen(true);
  uiStore.setHowComputedOpen(true);
  uiStore.setHowComputedOpen(false);
  off();
  assert.equal(calls, 2);
});
