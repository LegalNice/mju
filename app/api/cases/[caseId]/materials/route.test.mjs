import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

process.env.MJU_HOME = mkdtempSync(join(tmpdir(), "mju-home-"));

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { initStore } = await jiti.import("../../../../../lib/mju-store.ts");
const casesRoute = await jiti.import("../../../../cases/route.ts");
const materialsRoute = await jiti.import("./route.ts");

function url(path, query = {}) {
  const params = new URLSearchParams(query);
  return `http://mju.test${path}${params.size ? `?${params}` : ""}`;
}

async function upload(handler, caseId, { method = "POST", query, formData } = {}) {
  const response = await handler(
    new Request(url(`/api/cases/${caseId}/materials`, query), { method, body: formData }),
    { params: Promise.resolve({ caseId }) },
  );
  return { status: response.status, body: await response.json() };
}

function makeProject(t) {
  const cwd = mkdtempSync(join(tmpdir(), "mju-api-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  initStore(cwd, "Materials test");
  return cwd;
}

async function createCase(cwd) {
  const result = await casesRoute.POST(new Request(url("/api/cases"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cwd, title: "MaterialsCase", type: "litigation" }),
  }));
  return (await result.json()).case;
}

function makeFormData(files) {
  const formData = new FormData();
  for (const { name, content } of files) {
    formData.append("files", new Blob([content], { type: "application/octet-stream" }), name);
  }
  return formData;
}

test("uploads files into the case 材料/ directory", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);

  const result = await upload(materialsRoute.POST, caseItem.id, {
    query: { cwd },
    formData: makeFormData([
      { name: "合同.pdf", content: "pdf" },
      { name: "聊天记录.txt", content: "chat" },
    ]),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.uploaded.sort(), ["合同.pdf", "聊天记录.txt"]);
  assert.equal(existsSync(join(caseItem.vaultPath, "材料", "合同.pdf")), true);
  assert.equal(readFileSync(join(caseItem.vaultPath, "材料", "聊天记录.txt"), "utf8"), "chat");
});

test("conflict strategy error returns 409", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  const materialsDir = join(caseItem.vaultPath, "材料");
  writeFileSync(join(materialsDir, "existing.pdf"), "old", "utf8");

  const result = await upload(materialsRoute.POST, caseItem.id, {
    query: { cwd, conflict: "error" },
    formData: makeFormData([{ name: "existing.pdf", content: "new" }]),
  });

  assert.equal(result.status, 409);
  assert.deepEqual(result.body.conflicts, ["existing.pdf"]);
});

test("conflict strategy overwrite replaces existing file", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  const materialsDir = join(caseItem.vaultPath, "材料");
  writeFileSync(join(materialsDir, "existing.pdf"), "old", "utf8");

  const result = await upload(materialsRoute.POST, caseItem.id, {
    query: { cwd, conflict: "overwrite" },
    formData: makeFormData([{ name: "existing.pdf", content: "new" }]),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.uploaded, ["existing.pdf"]);
  assert.equal(readFileSync(join(materialsDir, "existing.pdf"), "utf8"), "new");
});
