import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { MjuStore } from "@/lib/mju-models";
import { mjuRootDir } from "@/lib/mju-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProjectSummary {
  cwd: string;
  name: string;
  caseCount: number;
  isObsidianVault: boolean;
  updatedAt: string;
}

/**
 * Filesystem-guided decode of an encoded project id ("-Users-foo-bar-").
 * Hyphens inside real directory names (e.g. "My-Obsidian-Vault") are
 * handled by backtracking: try the longest segment that exists on disk first.
 * Only a fallback — stores written by current versions carry `cwd` directly.
 */
function decodeProjectDir(encoded: string): string | null {
  const tokens = encoded.replace(/^-+|-+$/g, "").split("-").filter(Boolean);
  function walk(index: number, segments: string[]): string | null {
    if (index === tokens.length) {
      const cwd = "/" + segments.join("/");
      return existsSync(cwd) ? cwd : null;
    }
    for (let end = tokens.length; end > index; end--) {
      const segment = tokens.slice(index, end).join("-");
      if (!existsSync(join("/", ...segments, segment))) continue;
      const result = walk(end, [...segments, segment]);
      if (result) return result;
    }
    return null;
  }
  return walk(0, []);
}

function readProjectStore(projectDir: string): MjuStore | null {
  try {
    const raw = readFileSync(join(projectDir, "store.json"), "utf8");
    const store = JSON.parse(raw) as MjuStore;
    if (store.version !== 1 || typeof store.projectName !== "string" || !Array.isArray(store.cases)) return null;
    return store;
  } catch {
    return null;
  }
}

export async function GET() {
  const projectsRoot = join(mjuRootDir(), "projects");
  if (!existsSync(projectsRoot)) return NextResponse.json({ projects: [] });

  const projects: ProjectSummary[] = [];
  for (const entry of readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const store = readProjectStore(join(projectsRoot, entry.name));
    if (!store) continue;
    // Prefer the cwd the store recorded; fall back to decoding the dir name.
    const cwd = store.cwd && existsSync(store.cwd) ? store.cwd : decodeProjectDir(entry.name);
    if (!cwd) continue;
    projects.push({
      cwd,
      name: store.projectName,
      caseCount: store.cases.length,
      isObsidianVault: Boolean(store.isObsidianVault),
      updatedAt: store.updatedAt,
    });
  }
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json({ projects });
}
