import { basename, resolve, sep } from "node:path";
import { NextResponse } from "next/server";
import { writeStore } from "@/lib/mju-store";
import { readMjuConfig } from "@/lib/mju-config";
import { generateDocx, listTemplates, resolveTemplatesDir } from "@/lib/docx-generator";
import type { Deliverable } from "@/lib/mju-models";
import { findCase, getProjectStore, isNonEmptyString, isOptionalString, isProjectStore } from "@/lib/mju-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?cwd= — available DOCX template names. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const project = getProjectStore(params.get("cwd"));
  if (!isProjectStore(project)) return project.response;
  const config = readMjuConfig();
  return NextResponse.json({
    templates: listTemplates(project.cwd, { templatesDir: config.docx?.templatesDir }),
  });
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

    const config = readMjuConfig();
    const templatesDir = resolveTemplatesDir(project.cwd, { templatesDir: config.docx?.templatesDir });
    const outputPath = generateDocx({
      sourcePath,
      templateName: body.templateName || undefined,
      templatesDir,
    });

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
    const message = error instanceof Error ? error.message : String(error);
    // Map generator validation errors to appropriate status codes.
    if (message.includes("template not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("invalid templateName") || message.includes("sourcePath must be")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("pandoc")) {
      return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
