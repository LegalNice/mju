import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";
import { NextResponse } from "next/server";
import { writeStore } from "@/lib/mju-store";
import type { Deliverable } from "@/lib/mju-models";
import { findCase, getProjectStore, isNonEmptyString, isOptionalString, isProjectStore } from "@/lib/mju-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PANDOC_TIMEOUT_MS = 60_000;

/** Templates live under <vault>/templates/legal/** (subdirectories included). */
function templatesDir(cwd: string): string {
  return join(cwd, "templates", "legal");
}

function listTemplates(cwd: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 4 || out.length >= 100) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) walk(full, depth + 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".docx")) {
        // Name shown in the picker: relative path without extension, e.g. "evidence-and-litigation/民事起诉状（要素式）"
        out.push(full.slice(templatesDir(cwd).length + 1, -extname(entry.name).length));
      }
    }
  };
  walk(templatesDir(cwd), 0);
  return out;
}

function uniqueDocxPath(sourcePath: string): string {
  const base = sourcePath.replace(/\.md$/i, "");
  let candidate = `${base}.docx`;
  let n = 2;
  while (existsSync(candidate)) {
    candidate = `${base}-${n}.docx`;
    n++;
  }
  return candidate;
}

/** GET ?cwd= — available DOCX template names. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const project = getProjectStore(params.get("cwd"));
  if (!isProjectStore(project)) return project.response;
  return NextResponse.json({ templates: listTemplates(project.cwd) });
}

/**
 * POST { cwd, caseId, sourcePath, taskId?, templateName? }
 * Convert a case markdown file to DOCX via pandoc, register a Deliverable,
 * and link it back to the task. sourcePath must stay inside the case folder.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: unknown; caseId?: unknown; sourcePath?: unknown; taskId?: unknown; templateName?: unknown };
    const project = getProjectStore(typeof body.cwd === "string" ? body.cwd : null);
    if (!isProjectStore(project)) return project.response;
    if (!isNonEmptyString(body.caseId)) return NextResponse.json({ error: "caseId required" }, { status: 400 });
    const caseItem = findCase(project.store, body.caseId);
    if (!caseItem) return NextResponse.json({ error: "case not found" }, { status: 404 });
    if (!isNonEmptyString(body.sourcePath)) return NextResponse.json({ error: "sourcePath required" }, { status: 400 });
    if (!isOptionalString(body.taskId) || !isOptionalString(body.templateName)) {
      return NextResponse.json({ error: "taskId and templateName must be strings" }, { status: 400 });
    }

    // Containment guard: the markdown must live inside the case vault folder.
    const sourcePath = resolve(body.sourcePath);
    const vaultRoot = resolve(caseItem.vaultPath);
    if (sourcePath !== vaultRoot && !sourcePath.startsWith(vaultRoot + sep)) {
      return NextResponse.json({ error: "sourcePath must be inside the case folder" }, { status: 400 });
    }
    if (!/\.md$/i.test(sourcePath) || !existsSync(sourcePath)) {
      return NextResponse.json({ error: "sourcePath must be an existing .md file" }, { status: 400 });
    }

    const args = [sourcePath, "-o", ""] as string[];
    const outputPath = uniqueDocxPath(sourcePath);
    args[2] = outputPath;
    if (body.templateName) {
      const name = body.templateName.trim();
      // Template names are relative paths under templates/legal (may include
      // subdirectories) — reject traversal instead of whitelisting characters.
      if (!name || name.includes("..") || name.startsWith("/") || name.includes("\\")) {
        return NextResponse.json({ error: "invalid templateName" }, { status: 400 });
      }
      const templatePath = resolve(templatesDir(project.cwd), `${name}.docx`);
      const templatesRoot = resolve(templatesDir(project.cwd));
      if (!templatePath.startsWith(templatesRoot + sep) || !existsSync(templatePath)) {
        return NextResponse.json({ error: "template not found" }, { status: 404 });
      }
      args.push("--reference-doc", templatePath);
    }

    try {
      execFileSync("pandoc", args, { timeout: PANDOC_TIMEOUT_MS, stdio: ["ignore", "ignore", "pipe"] });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `pandoc failed: ${detail.slice(0, 300)}` }, { status: 500 });
    }

    const deliverable: Deliverable = {
      id: crypto.randomUUID(),
      caseId: caseItem.id,
      taskId: body.taskId,
      title: basename(outputPath, ".docx"),
      type: "docx-revision",
      filePath: outputPath,
      status: "draft",
      version: 1,
      createdAt: new Date().toISOString(),
    };
    project.store.deliverables.push(deliverable);

    // Link back to the task so the UI can show the generated file.
    let task;
    if (body.taskId) {
      task = project.store.tasks.find((t) => t.id === body.taskId);
      if (task) task.deliverablePath = outputPath;
    }
    writeStore(project.cwd, project.store);
    return NextResponse.json({ success: true, deliverable, task });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
