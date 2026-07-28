import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  CANONICAL_DIRS,
  CASE_SKELETON_DIRS,
  GUIDANCE_FILENAME,
  ensureCanonicalStructure,
  ensureCaseSkeleton,
  writeGuidanceIfAbsent,
} = await jiti.import("./mju-guidance.ts");

test("ensureCaseSkeleton creates subdirectories and a master file", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-case-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = ensureCaseSkeleton(root, "甲公司 vs 乙公司", "litigation");
  assert.deepEqual(result.dirs, CASE_SKELETON_DIRS);
  assert.equal(result.masterFileWritten, true);

  for (const dir of CASE_SKELETON_DIRS) {
    assert.equal(existsSync(join(root, dir)), true, `missing ${dir}`);
  }

  const masterPath = join(root, "甲公司 vs 乙公司.md");
  assert.equal(existsSync(masterPath), true);
  const content = readFileSync(masterPath, "utf8");
  assert.match(content, /案件类型: 争议解决/);
  assert.match(content, /# 甲公司 vs 乙公司/);
});

test("ensureCaseSkeleton is idempotent and preserves an existing master file", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-case-idempotent-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  ensureCaseSkeleton(root, "顾问项目", "advisory");
  const masterPath = join(root, "顾问项目.md");
  writeFileSync(masterPath, "# custom\n");

  const result = ensureCaseSkeleton(root, "顾问项目", "advisory");
  assert.equal(result.dirs.length, 0, "directories should not be recreated");
  assert.equal(result.masterFileWritten, false, "existing master file must not be overwritten");
  assert.equal(readFileSync(masterPath, "utf8"), "# custom\n");
});

test("ensureCaseSkeleton labels project cases as 专项", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-case-project-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  ensureCaseSkeleton(root, "股权激励专项", "project");
  const content = readFileSync(join(root, "股权激励专项.md"), "utf8");
  assert.match(content, /案件类型: 专项/);
});

test("ensureCaseSkeleton sanitizes path separators in the master file name", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-case-safe-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  ensureCaseSkeleton(root, "a/b\\c", "advisory");
  assert.equal(existsSync(join(root, "a_b_c.md")), true);
});

test("ensureCanonicalStructure creates the canonical project directories", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-canonical-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const created = ensureCanonicalStructure(root);
  assert.deepEqual(created, CANONICAL_DIRS);

  for (const dir of CANONICAL_DIRS) {
    assert.equal(existsSync(join(root, dir)), true, `missing ${dir}`);
  }

  const second = ensureCanonicalStructure(root);
  assert.equal(second.length, 0);
});

test("writeGuidanceIfAbsent writes the guidance once and includes material routing", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-guidance-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(writeGuidanceIfAbsent(root), true);
  const guidancePath = join(root, GUIDANCE_FILENAME);
  assert.equal(existsSync(guidancePath), true);
  const content = readFileSync(guidancePath, "utf8");
  assert.match(content, /资料归位/);
  assert.match(content, /材料/);

  assert.equal(writeGuidanceIfAbsent(root), false);
});
