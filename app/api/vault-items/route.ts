import { NextResponse } from "next/server";
import { scanVaultItems, type VaultItem } from "@/lib/mju-vault-items";
import { getProjectStore, isProjectStore } from "@/lib/mju-route-utils";

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
