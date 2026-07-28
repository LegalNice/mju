import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { readMjuConfig } from "@/lib/mju-config";
import { analyzeCaseMaterials } from "@/lib/material-analysis";
import { findCase, getProjectStore, isNonEmptyString, isProjectStore } from "@/lib/mju-route-utils";
import { validateUploadFileNames } from "@/lib/file-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MINERU_BASE = "https://mineru.net/api/v4";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface MineruFile {
  name: string;
  bytes: Buffer;
}

interface MineruBatchResult {
  batchId: string;
  taskId?: string;
  state: "waiting-file" | "pending" | "running" | "converting" | "done" | "failed";
  fullZipUrl?: string;
  errMsg?: string;
  fileName?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueOutputPath(dir: string, originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/u, "");
  const name = `${base}.md`;
  let candidate = join(dir, name);
  if (!existsSync(candidate)) return candidate;
  let n = 2;
  while (true) {
    candidate = join(dir, `${base}-${n}.md`);
    if (!existsSync(candidate)) return candidate;
    n++;
  }
}

async function fetchJson(url: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(url, options);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`MinerU returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = (parsed && typeof parsed === "object" && "msg" in parsed && typeof parsed.msg === "string")
      ? parsed.msg
      : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed;
}

async function createBatchUpload(token: string, files: MineruFile[], options: {
  modelVersion: string;
  enableOcr: boolean;
  enableTable: boolean;
  enableFormula: boolean;
}): Promise<{ batchId: string; fileUrls: string[] }> {
  const body = {
    files: files.map((f) => ({
      name: f.name,
      is_ocr: options.enableOcr,
    })),
    model_version: options.modelVersion,
    enable_formula: options.enableFormula,
    enable_table: options.enableTable,
    language: "ch",
  };

  const data = (await fetchJson(`${MINERU_BASE}/file-urls/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })) as Record<string, unknown>;

  const batchId = (data.batch_id ?? data.batchId) as string | undefined;
  const fileUrls = Array.isArray(data.file_urls) ? data.file_urls as string[] : undefined;
  if (!batchId || !fileUrls || fileUrls.length !== files.length) {
    throw new Error("MinerU did not return a valid batch upload session");
  }
  return { batchId, fileUrls };
}

async function uploadToSignedUrls(files: MineruFile[], signedUrls: string[]): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const res = await fetch(signedUrls[i], {
      method: "PUT",
      body: new Uint8Array(files[i].bytes),
    });
    if (!res.ok) {
      throw new Error(`上传 ${files[i].name} 到 MinerU 失败（${res.status}）`);
    }
  }
}

async function pollBatchResult(token: string, batchId: string, fileName: string): Promise<MineruBatchResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const data = (await fetchJson(`${MINERU_BASE}/extract-results/batch/${batchId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    })) as Record<string, unknown>;

    const results = Array.isArray(data.extract_result)
      ? data.extract_result as Array<Record<string, unknown>>
      : [];
    const result = results.find((r) => r.file_name === fileName) ?? results[0];

    if (result) {
      const state = String(result.state ?? "pending");
      if (state === "done") {
        return {
          batchId,
          fileName,
          state: "done",
          fullZipUrl: typeof result.full_zip_url === "string" ? result.full_zip_url : undefined,
        };
      }
      if (state === "failed") {
        return {
          batchId,
          fileName,
          state: "failed",
          errMsg: typeof result.err_msg === "string" ? result.err_msg : "提取失败",
        };
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("MinerU 转换超时，请稍后到 MinerU 控制台查看结果");
}

async function extractMarkdownFromZip(zipUrl: string): Promise<string> {
  const res = await fetch(zipUrl);
  if (!res.ok) {
    throw new Error(`下载 MinerU 结果失败（${res.status}）`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("full.md") ?? zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".md"));
  if (!entry) {
    throw new Error("MinerU 结果压缩包中未找到 Markdown 文件");
  }
  return zip.readAsText(entry, "utf8");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await params;
    const { searchParams } = new URL(request.url);
    const cwd = searchParams.get("cwd");

    if (!isNonEmptyString(cwd)) {
      return NextResponse.json({ error: "cwd required" }, { status: 400 });
    }
    const project = getProjectStore(cwd);
    if (!isProjectStore(project)) return project.response;

    const caseItem = findCase(project.store, caseId);
    if (!caseItem) {
      return NextResponse.json({ error: "case not found" }, { status: 404 });
    }

    const config = readMjuConfig().mineru;
    const token = config?.apiToken?.trim();
    if (!token || !config) {
      return NextResponse.json({ error: "MinerU API Token 未配置，请先在首页 MINERU 设置中填入" }, { status: 400 });
    }

    const formData = await request.formData();
    const fileEntries = formData.getAll("files").filter((entry): entry is File => typeof entry !== "string");
    const fileNames = fileEntries.map((f) => f.name);
    const validationError = validateUploadFileNames(fileNames);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"]);
    const unsupported = fileNames.filter((name) => {
      const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
      return !allowedExtensions.has(ext);
    });
    if (unsupported.length > 0) {
      return NextResponse.json({ error: `不支持格式：${unsupported.join(", ")}` }, { status: 400 });
    }

    const files: MineruFile[] = [];
    for (const file of fileEntries) {
      files.push({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
    }

    const { batchId, fileUrls } = await createBatchUpload(token, files, {
      modelVersion: config.modelVersion ?? "vlm",
      enableOcr: config.enableOcr ?? false,
      enableTable: config.enableTable ?? true,
      enableFormula: config.enableFormula ?? true,
    });

    await uploadToSignedUrls(files, fileUrls);

    const materialsDir = join(caseItem.vaultPath, "材料");
    mkdirSync(materialsDir, { recursive: true });

    const saved: string[] = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const file of files) {
      try {
        const result = await pollBatchResult(token, batchId, file.name);
        if (result.state === "failed" || !result.fullZipUrl) {
          throw new Error(result.errMsg ?? "提取失败");
        }
        const markdown = await extractMarkdownFromZip(result.fullZipUrl);
        const outPath = uniqueOutputPath(materialsDir, file.name);
        writeFileSync(outPath, markdown, "utf8");
        saved.push(basename(outPath));
      } catch (err) {
        errors.push({
          name: file.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Auto-classify and move the new Markdown files; skip when every
    // conversion failed so we do not touch unrelated pre-existing materials.
    const analysis = saved.length > 0 ? analyzeCaseMaterials(project, caseItem) : null;

    return NextResponse.json({ saved, errors, materialsDir, analysis }, { status: errors.length > 0 ? 207 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
