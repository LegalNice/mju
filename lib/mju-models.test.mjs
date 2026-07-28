import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { createEmptyStore, DEFAULT_STORE, touchStore } = await jiti.import("./mju-models.ts");

test("createEmptyStore returns a valid MjuStore structure", () => {
  const store = createEmptyStore("test-project");
  assert.equal(store.version, 1);
  assert.equal(store.projectName, "test-project");
  assert.ok(store.createdAt);
  assert.ok(store.updatedAt);
  assert.deepEqual(store.clients, []);
  assert.deepEqual(store.cases, []);
  assert.deepEqual(store.tasks, []);
  assert.deepEqual(store.deadlines, []);
  assert.deepEqual(store.schedules, []);
  assert.deepEqual(store.deliverables, []);
  assert.deepEqual(store.workflowRuns, []);
});

test("DEFAULT_STORE matches the empty store defaults", () => {
  const store = createEmptyStore("default-check");
  assert.equal(store.version, DEFAULT_STORE.version);
  assert.deepEqual(store.clients, DEFAULT_STORE.clients);
  assert.deepEqual(store.cases, DEFAULT_STORE.cases);
  assert.deepEqual(store.tasks, DEFAULT_STORE.tasks);
  assert.deepEqual(store.deadlines, DEFAULT_STORE.deadlines);
  assert.deepEqual(store.schedules, DEFAULT_STORE.schedules);
  assert.deepEqual(store.deliverables, DEFAULT_STORE.deliverables);
  assert.deepEqual(store.workflowRuns, DEFAULT_STORE.workflowRuns);
});

test("touchStore updates updatedAt", () => {
  const store = createEmptyStore("touch");
  const before = store.updatedAt;
  // Ensure a measurable delay
  const start = Date.now();
  while (Date.now() - start < 5) { /* busy wait */ }
  const updated = touchStore(store);
  assert.ok(updated.updatedAt > before, "updatedAt should advance");
  assert.equal(updated.projectName, store.projectName);
});
