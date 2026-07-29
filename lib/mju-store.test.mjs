import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

// Point the mju root at a temp dir before importing the store module.
const mjuHome = mkdtempSync(join(tmpdir(), "mju-home-"));
process.env.MJU_HOME = mjuHome;

const jiti = createJiti(import.meta.url);
const { createEmptyStore } = await jiti.import("./mju-models.ts");
const { readStore, storePath, writeStore } = await jiti.import("./mju-store.ts");
const { encodeProjectId } = await jiti.import("./mju-paths.ts");

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

test("stores live under MJU_HOME/projects, not inside the workspace", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-store-outside-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(storePath(root), join(mjuHome, "projects", encodeProjectId(root), "store.json"));

  writeStore(root, createEmptyStore("outside"));
  assert.equal(existsSync(join(root, ".mju")), false, "workspace must stay clean");
});

test("encodes Windows project paths as stable filesystem-safe ids", () => {
  const forwardSlash = encodeProjectId("C:/Users/dangdang/mju-vault/");
  const backslash = encodeProjectId("C:\\Users\\dangdang\\mju-vault\\");
  const otherDrive = encodeProjectId("D:/Users/dangdang/mju-vault");

  assert.equal(forwardSlash, backslash, "separator spelling must not create a second project");
  assert.match(forwardSlash, /^-C-Users-dangdang-mju-vault-[a-f0-9]{10}-$/);
  assert.doesNotMatch(forwardSlash, /[\\/:*?"<>|]/);
  assert.notEqual(forwardSlash, otherDrive, "different absolute paths must not collide");
});

test("reads a legacy in-workspace store as fallback and migrates on write", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-store-legacy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(join(root, ".mju"));
  const legacy = createEmptyStore("legacy");
  writeFileSync(join(root, ".mju", "store.json"), JSON.stringify(legacy), "utf8");

  assert.equal(readStore(root)?.projectName, "legacy");
  assert.equal(existsSync(storePath(root)), false, "fallback read must not create the new store");

  writeStore(root, readStore(root));
  assert.equal(readFileSync(storePath(root), "utf8").includes('"projectName": "legacy"'), true);
});

test("treats malformed store files as unreadable", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-store-invalid-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(join(root, ".mju"));
  writeFileSync(join(root, ".mju", "store.json"), "{}", { encoding: "utf8", flush: true });
  assert.equal(readStore(root), null);
});
