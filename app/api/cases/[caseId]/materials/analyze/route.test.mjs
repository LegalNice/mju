import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createJiti } from "jiti";

process.env.MJU_HOME = mkdtempSync(join(tmpdir(), "mju-home-"));

const root = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { initStore, readStore } = await jiti.import(join(root, "lib/mju-store.ts"));
const casesRoute = await jiti.import(join(root, "app/api/cases/route.ts"));
const analyzeRoute = await jiti.import(fileURLToPath(new URL("./route.ts", import.meta.url)));

function url(path, query = {}) {
  const params = new URLSearchParams(query);
  return `http://mju.test${path}${params.size ? `?${params}` : ""}`;
}

async function callAnalyze(handler, caseId, { query } = {}) {
  const response = await handler(
    new Request(url(`/api/cases/${caseId}/materials/analyze`, query), { method: "POST" }),
    { params: Promise.resolve({ caseId }) },
  );
  return { status: response.status, body: await response.json() };
}

function makeProject(t) {
  const cwd = mkdtempSync(join(tmpdir(), "mju-api-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  initStore(cwd, "Analyze test");
  return cwd;
}

async function createCase(cwd) {
  const result = await casesRoute.POST(new Request(url("/api/cases"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cwd, title: "AnalyzeCase", type: "litigation" }),
  }));
  return (await result.json()).case;
}

test("analyzes materials, moves high-confidence pleadings, and creates deadlines", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  const materialsDir = join(caseItem.vaultPath, "材料");
  writeFileSync(join(materialsDir, "起诉状-2026-08-01.md"), "# 起诉状");
  writeFileSync(join(materialsDir, "判决书-2026-08-15.pdf"), "pdf");
  writeFileSync(join(materialsDir, "合同.pdf"), "pdf");

  const result = await callAnalyze(analyzeRoute.POST, caseItem.id, { query: { cwd } });

  assert.equal(result.status, 200);
  assert.equal(result.body.classifications.length, 3);

  // Pleading should be auto-moved to 文书/
  assert.equal(existsSync(join(caseItem.vaultPath, "文书", "起诉状-2026-08-01.md")), true);
  assert.equal(existsSync(join(materialsDir, "起诉状-2026-08-01.md")), false);

  // Court document (判决书) with date creates a projected deadline: appeal
  // window = 文书日期 +15日, status "proposed" (待律师确认).
  assert.equal(result.body.createdDeadlines.length, 1);
  assert.equal(result.body.createdDeadlines[0].deadline.date, "2026-08-30");
  assert.equal(result.body.createdDeadlines[0].deadline.type, "court");
  assert.equal(result.body.createdDeadlines[0].deadline.status, "proposed");
  assert.ok(result.body.createdDeadlines[0].deadline.vaultPath);
  assert.equal(existsSync(result.body.createdDeadlines[0].filePath), true);

  // A review task should be created.
  assert.ok(result.body.reviewTask);
  assert.equal(result.body.reviewTask.task.title, "审阅并分类新到材料");

  const store = readStore(cwd);
  assert.equal(store.tasks.length, 1);
  assert.equal(store.deadlines.length, 1);
});

test("returns 400 when there are no materials", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);

  const result = await callAnalyze(analyzeRoute.POST, caseItem.id, { query: { cwd } });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /no materials/);
});
