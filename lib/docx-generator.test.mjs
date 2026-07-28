import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  defaultTemplatesDir,
  generateDocx,
  listTemplates,
  resolveTemplatePath,
  resolveTemplatesDir,
  uniqueDocxPath,
} = await jiti.import("./docx-generator.ts");

test("defaultTemplatesDir returns <cwd>/templates/legal", () => {
  assert.equal(defaultTemplatesDir("/project"), "/project/templates/legal");
});

test("resolveTemplatesDir respects override", () => {
  assert.equal(resolveTemplatesDir("/project"), "/project/templates/legal");
  assert.equal(resolveTemplatesDir("/project", { templatesDir: "/custom" }), "/custom");
});

test("listTemplates scans nested .docx files", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-docx-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(join(root, "civil"), { recursive: true });
  writeFileSync(join(root, "civil", "起诉状.docx"), "docx");
  writeFileSync(join(root, "通用.docx"), "docx");

  const templates = listTemplates(root, { templatesDir: root });
  assert.deepEqual(templates.sort(), ["civil/起诉状", "通用"]);
});

test("uniqueDocxPath avoids conflicts", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-docx-unique-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const source = join(root, "doc.md");
  writeFileSync(source, "# doc");
  assert.equal(uniqueDocxPath(source), join(root, "doc.docx"));

  writeFileSync(join(root, "doc.docx"), "docx");
  assert.equal(uniqueDocxPath(source), join(root, "doc-2.docx"));
});

test("resolveTemplatePath validates containment", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-docx-tpl-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(join(root, "nested"), { recursive: true });
  writeFileSync(join(root, "nested", "a.docx"), "docx");

  assert.equal(resolveTemplatePath(root, "nested/a").endsWith("nested/a.docx"), true);
  assert.throws(() => resolveTemplatePath(root, "../a"), /invalid templateName/);
  assert.throws(() => resolveTemplatePath(root, "missing"), /template not found/);
});

test("generateDocx runs pandoc when available", { skip: !process.env.RUN_PANDOC_TESTS }, (t) => {
  const root = mkdtempSync(join(tmpdir(), "mju-docx-pandoc-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const source = join(root, "source.md");
  writeFileSync(source, "# Hello\n");
  const output = generateDocx({ sourcePath: source });
  assert.equal(output.endsWith(".docx"), true);
});
