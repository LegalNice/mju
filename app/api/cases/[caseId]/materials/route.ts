import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { writeStore } from "@/lib/mju-store";
import {
  inspectUploadTargets,
  parseUploadConflictStrategy,
  validateUploadFileNames,
} from "@/lib/file-upload";
import { findCase, getProjectStore, isNonEmptyString, isProjectStore } from "@/lib/mju-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const materialsDir = join(caseItem.vaultPath, "材料");
    mkdirSync(materialsDir, { recursive: true });

    const strategy = parseUploadConflictStrategy(searchParams.get("conflict"));
    if (!strategy) {
      return NextResponse.json({ error: "Invalid conflict strategy" }, { status: 400 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files").filter((entry): entry is File => typeof entry !== "string");
    const fileNames = files.map((file) => file.name);
    const validationError = validateUploadFileNames(fileNames);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const inspection = inspectUploadTargets(materialsDir, fileNames);
    if (strategy === "error" && inspection.conflicts.length > 0) {
      return NextResponse.json({
        error: "One or more files already exist",
        conflicts: inspection.conflicts,
        nonReplaceable: inspection.nonReplaceable,
      }, { status: 409 });
    }

    const conflictSet = new Set(inspection.conflicts);
    const nonReplaceableSet = new Set(inspection.nonReplaceable);
    const uploaded: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const file of files) {
      const destination = join(materialsDir, file.name);
      if (conflictSet.has(file.name) && strategy === "skip") {
        skipped.push(file.name);
        continue;
      }
      if (conflictSet.has(file.name) && nonReplaceableSet.has(file.name)) {
        errors.push({ name: file.name, error: "Cannot replace a directory or symbolic link" });
        continue;
      }

      let bytes: Buffer;
      try {
        bytes = Buffer.from(await file.arrayBuffer());
      } catch (error) {
        errors.push({ name: file.name, error: error instanceof Error ? error.message : String(error) });
        continue;
      }

      if (conflictSet.has(file.name)) {
        try {
          // overwrite strategy: remove existing file before writing
          const { rmSync } = await import("node:fs");
          rmSync(destination);
        } catch (error) {
          errors.push({ name: file.name, error: error instanceof Error ? error.message : String(error) });
          continue;
        }
      }

      try {
        writeFileSync(destination, bytes, { flag: "wx" });
        uploaded.push(file.name);
      } catch (error) {
        errors.push({ name: file.name, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Persist any store changes (currently a no-op, but keeps the API consistent
    // with other mutation endpoints).
    writeStore(project.cwd, project.store);

    return NextResponse.json(
      { uploaded, skipped, errors, materialsDir },
      { status: errors.length > 0 ? 207 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
