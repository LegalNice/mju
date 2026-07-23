import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NextResponse } from "next/server";
import { allowFileRoot } from "@/lib/file-access";
import { findCase, getProjectStore, isProjectStore } from "@/lib/mju-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CaseDocEntry {
  /** Absolute path (consumable by /api/files) */
  path: string;
  /** Path relative to the case vault folder, for display */
  relPath: string;
  name: string;
  mtime: string;
  size: number;
}

const SKIP_DIRS = new Set([".obsidian", ".git", ".trash", "node_modules"]);
const MAX_DOCS = 200;

function collectMarkdown(dir: string, root: string, out: CaseDocEntry[]): void {
  if (out.length >= MAX_DOCS) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_DOCS) return;
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectMarkdown(full, root, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      try {
        const stat = statSync(full);
        out.push({
          path: full,
          relPath: relative(root, full),
          name: entry.name,
          mtime: stat.mtime.toISOString(),
          size: stat.size,
        });
      } catch {
        // vanished between readdir and stat — skip
      }
    }
  }
}

/** GET ?cwd=&caseId= — markdown files under the case vault folder, newest first. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const project = getProjectStore(params.get("cwd"));
  if (!isProjectStore(project)) return project.response;

  const caseId = params.get("caseId");
  if (!caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });
  const caseItem = findCase(project.store, caseId);
  if (!caseItem) return NextResponse.json({ error: "case not found" }, { status: 404 });
  if (!existsSync(caseItem.vaultPath)) {
    return NextResponse.json({ docs: [], missing: true });
  }

  // Make the case folder readable through /api/files for the preview pane.
  allowFileRoot(caseItem.vaultPath);

  const docs: CaseDocEntry[] = [];
  collectMarkdown(caseItem.vaultPath, caseItem.vaultPath, docs);
  docs.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return NextResponse.json({ docs });
}
