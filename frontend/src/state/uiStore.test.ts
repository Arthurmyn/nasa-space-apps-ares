import assert from "node:assert/strict";
import test from "node:test";
import { uiStore } from "./uiStore.ts";

test("the left flyout starts closed, opens from the rail and closes on a second press", () => {
  assert.equal(uiStore.get().leftPanel, null);
  uiStore.toggleSidePanel("layers");
  assert.equal(uiStore.get().leftPanel, "layers");
  uiStore.toggleSidePanel("conditions");
  assert.equal(uiStore.get().leftPanel, "conditions");
  uiStore.toggleSidePanel("conditions");
  assert.equal(uiStore.get().leftPanel, null);
  uiStore.showSidePanel("sites");
  uiStore.showSidePanel(null);
  assert.equal(uiStore.get().leftPanel, null);
});

test("the route column folds on its own", () => {
  assert.equal(uiStore.get().rightCollapsed, false);
  uiStore.toggleRight();
  assert.deepEqual([uiStore.get().rightCollapsed, uiStore.get().leftPanel], [true, null]);
  uiStore.toggleRight();
  assert.equal(uiStore.get().rightCollapsed, false);
});

test("subscribers are told once per real change", () => {
  let calls = 0;
  const off = uiStore.subscribe(() => (calls += 1));
  uiStore.showSidePanel("method");
  uiStore.showSidePanel("method");
  uiStore.showSidePanel(null);
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
