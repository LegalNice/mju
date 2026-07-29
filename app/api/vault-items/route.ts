import { NextResponse } from "next/server";
import { scanVaultItems, type VaultItem, updateVaultItemDate } from "@/lib/mju-vault-items";
import { getProjectStore, isProjectStore, isValidDate } from "@/lib/mju-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scanning hundreds of files per request would be wasteful — DatesView loads
// this once per mount, but a short cache also covers route refreshes.
declare global {
  var __mjuVaultItemsCache: { cwd: string; items: VaultItem[]; expiresAt: number } | undefined;
}
const CACHE_TTL_MS = 15_000;

/** GET ?cwd= — vault-native 任务/期限/日程 items (frontmatter scan), undated/done excluded. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const project = getProjectStore(params.get("cwd"));
  if (!isProjectStore(project)) return project.response;

  const now = Date.now();
  const cached = globalThis.__mjuVaultItemsCache;
  if (cached && cached.cwd === project.cwd && cached.expiresAt > now) {
    return NextResponse.json({ items: cached.items });
  }
  const items = scanVaultItems(project.cwd, project.store);
  globalThis.__mjuVaultItemsCache = { cwd: project.cwd, items, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json({ items });
}

/** PATCH { cwd, filePath, kind, date, time? } — edit a Vault deadline/schedule date field. */
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      cwd?: string;
      filePath?: string;
      kind?: "deadline" | "schedule";
      date?: string;
      time?: string;
    };
    const project = getProjectStore(body.cwd);
    if (!isProjectStore(project)) return project.response;
    if (!body.filePath || (body.kind !== "deadline" && body.kind !== "schedule") || !isValidDate(body.date)) {
      return NextResponse.json({ error: "filePath, kind and valid date required" }, { status: 400 });
    }
    if (body.kind === "schedule" && (!body.time || !/^\d{2}:\d{2}$/.test(body.time))) {
      return NextResponse.json({ error: "valid schedule time required" }, { status: 400 });
    }
    updateVaultItemDate(project.cwd, body.filePath, body.kind, body.date, body.time);
    if (globalThis.__mjuVaultItemsCache?.cwd === project.cwd) globalThis.__mjuVaultItemsCache = undefined;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
