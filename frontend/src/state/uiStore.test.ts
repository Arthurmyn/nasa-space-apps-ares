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

test("the Curiosity traverse is on by default and toggles", () => {
  assert.equal(uiStore.get().traverseOn, true);
  uiStore.toggleTraverse();
  assert.equal(uiStore.get().traverseOn, false);
  uiStore.toggleTraverse();
  assert.equal(uiStore.get().traverseOn, true);
});

test("the drawer and the drive path overlay are stored and notify once per change", () => {
  let calls = 0;
  const off = uiStore.subscribe(() => (calls += 1));
  uiStore.setSensitivityOpen(true);
  uiStore.setSensitivityOpen(true);
  uiStore.setDrivePathOn(true);
  assert.deepEqual([uiStore.get().sensitivityOpen, uiStore.get().drivePathOn], [true, true]);
  uiStore.setSensitivityOpen(false);
  uiStore.setDrivePathOn(false);
  off();
  assert.equal(calls, 4);
});
