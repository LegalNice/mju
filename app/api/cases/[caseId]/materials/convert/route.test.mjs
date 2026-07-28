import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import AdmZip from "adm-zip";
import { createJiti } from "jiti";

process.env.MJU_HOME = mkdtempSync(join(tmpdir(), "mju-home-"));

const root = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { initStore, readStore } = await jiti.import(join(root, "lib/mju-store.ts"));
const { writeMjuConfig } = await jiti.import(join(root, "lib/mju-config.ts"));
const casesRoute = await jiti.import(join(root, "app/api/cases/route.ts"));
const convertRoute = await jiti.import(fileURLToPath(new URL("./route.ts", import.meta.url)));

function url(path, query = {}) {
  const params = new URLSearchParams(query);
  return `http://mju.test${path}${params.size ? `?${params}` : ""}`;
}

async function convert(handler, caseId, { query, formData } = {}) {
  const response = await handler(
    new Request(url(`/api/cases/${caseId}/materials/convert`, query), { method: "POST", body: formData }),
    { params: Promise.resolve({ caseId }) },
  );
  return { status: response.status, body: await response.json() };
}

function makeProject(t) {
  const cwd = mkdtempSync(join(tmpdir(), "mju-convert-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  initStore(cwd, "Convert test");
  return cwd;
}

async function createCase(cwd) {
  const result = await casesRoute.POST(new Request(url("/api/cases"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cwd, title: "ConvertCase", type: "litigation" }),
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

test("rejects conversion when MinerU token is not configured", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  writeMjuConfig({ mineru: undefined });

  const result = await convert(convertRoute.POST, caseItem.id, {
    query: { cwd },
    formData: makeFormData([{ name: "contract.pdf", content: "pdf" }]),
  });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /Token/);
});

test("rejects unsupported file formats", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  writeMjuConfig({ mineru: { apiToken: "fake-token" } });

  const result = await convert(convertRoute.POST, caseItem.id, {
    query: { cwd },
    formData: makeFormData([{ name: "image.png", content: "png" }]),
  });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /不支持格式/);
});

function makeMarkdownZip(markdown) {
  const zip = new AdmZip();
  zip.addFile("full.md", Buffer.from(markdown, "utf8"));
  return zip.toBuffer();
}

function stubMineruFetch(t, { markdown }) {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, options) => {
    const urlText = String(input);
    if (urlText.endsWith("/file-urls/batch")) {
      const body = JSON.parse(options.body);
      return Response.json({
        batch_id: "batch-1",
        file_urls: body.files.map((f) => `https://signed.example.com/${encodeURIComponent(f.name)}`),
      });
    }
    if (urlText.startsWith("https://signed.example.com/")) {
      return new Response(null, { status: 200 });
    }
    if (urlText.includes("/extract-results/batch/")) {
      return Response.json({
        extract_result: [{
          file_name: decodeURIComponent(urlText.split("/").pop() ?? ""),
          state: "done",
          full_zip_url: "https://results.example.com/result.zip",
        }],
      });
    }
    if (urlText === "https://results.example.com/result.zip") {
      return new Response(makeMarkdownZip(markdown), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${urlText}`);
  };
}

test("converts a PDF, saves Markdown, and chains server-side analysis", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  writeMjuConfig({ mineru: { apiToken: "fake-token" } });
  stubMineruFetch(t, { markdown: "# 民事起诉状\n\n原告：张三" });

  const result = await convert(convertRoute.POST, caseItem.id, {
    query: { cwd },
    formData: makeFormData([{ name: "起诉状-2026-08-01.pdf", content: "pdf-bytes" }]),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.saved, ["起诉状-2026-08-01.md"]);
  assert.deepEqual(result.body.errors, []);

  // Converted Markdown is written under 材料/ (then auto-moved by analysis).
  assert.ok(result.body.analysis);
  const moved = result.body.analysis.moved;
  assert.equal(moved.length, 1);
  const target = moved[0].to;
  assert.equal(existsSync(target), true);
  assert.match(readFileSync(target, "utf8"), /民事起诉状/);

  // Chained analysis recorded a chronicle entry and a review task.
  assert.equal(existsSync(result.body.analysis.chroniclePath), true);
  assert.equal(result.body.analysis.reviewTask.task.title, "审阅并分类新到材料");
  const store = readStore(cwd);
  assert.equal(store.tasks.length, 1);
});
