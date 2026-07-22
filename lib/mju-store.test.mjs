import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { createEmptyStore } = await jiti.import("./mju-models.ts");
const { readStore, storePath, writeStore } = await jiti.import("./mju-store.ts");

test("creates isolated project stores and persists them atomically", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-store-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const first = createEmptyStore("first");
  const second = createEmptyStore("second");
  first.tasks.push({ id: "task-1" });
  assert.equal(second.tasks.length, 0);

  writeStore(root, first);
  assert.deepEqual(readStore(root)?.tasks, [{ id: "task-1" }]);
  assert.equal(existsSync(`${storePath(root)}.tmp`), false);
  assert.match(readFileSync(storePath(root), "utf8"), /"projectName": "first"/);
});

test("treats malformed store files as unreadable", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-store-invalid-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(join(root, ".mju"));
  writeFileSync(join(root, ".mju", "store.json"), "{}", { encoding: "utf8", flush: true });
  assert.equal(readStore(root), null);
  assert.equal(storePath(root), join(root, ".mju", "store.json"));
});
