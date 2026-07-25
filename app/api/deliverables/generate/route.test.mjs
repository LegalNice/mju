import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

process.env.MJU_HOME = mkdtempSync(join(tmpdir(), "mju-home-"));

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { initStore } = await jiti.import("../../../../lib/mju-store.ts");
const casesRoute = await jiti.import("../../../cases/route.ts");
const generateRoute = await jiti.import("./route.ts");

function url(path, query = {}) {
  const params = new URLSearchParams(query);
  return `http://mju.test${path}${params.size ? `?${params}` : ""}`;
}

async function call(handler, path, { method = "GET", query, body } = {}) {
  const response = await handler(new Request(url(path, query), body === undefined ? { method } : {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
}

function makeProject(t) {
  const cwd = mkdtempSync(join(tmpdir(), "mju-api-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  initStore(cwd, "Docx test");
  return cwd;
}

async function createCase(cwd) {
  const result = await call(casesRoute.POST, "/api/cases", {
    method: "POST",
    body: { cwd, title: "DocxCase", type: "litigation" },
  });
  assert.equal(result.status, 200);
  return result.body.case;
}

test("lists available docx templates", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  mkdirSync(join(cwd, "templates", "legal", "civil"), { recursive: true });
  writeFileSync(join(cwd, "templates", "legal", "civil", "起诉状.docx"), "docx");
  writeFileSync(join(cwd, "templates", "legal", "通用.docx"), "docx");

  const listed = await call(generateRoute.GET, "/api/deliverables/generate", { query: { cwd, caseId: caseItem.id } });
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.templates.sort(), ["civil/起诉状", "通用"]);
});

test("rejects sourcePath outside the case folder", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  const result = await call(generateRoute.POST, "/api/deliverables/generate", {
    method: "POST",
    body: { cwd, caseId: caseItem.id, sourcePath: "/etc/passwd" },
  });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /inside the case folder/);
});

test("rejects invalid templateName", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  const sourcePath = join(caseItem.vaultPath, "source.md");
  writeFileSync(sourcePath, "# source");

  const result = await call(generateRoute.POST, "/api/deliverables/generate", {
    method: "POST",
    body: { cwd, caseId: caseItem.id, sourcePath, templateName: "../evil" },
  });
  assert.equal(result.status, 400);
});

test("rejects missing template", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  const sourcePath = join(caseItem.vaultPath, "source.md");
  writeFileSync(sourcePath, "# source");

  const result = await call(generateRoute.POST, "/api/deliverables/generate", {
    method: "POST",
    body: { cwd, caseId: caseItem.id, sourcePath, templateName: "missing" },
  });
  assert.equal(result.status, 404);
});
