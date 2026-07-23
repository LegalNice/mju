import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { initStore, readStore, writeStore } from "@/lib/mju-store";
import { isObsidianVault, scanObsidianCases } from "@/lib/mju-obsidian";
import type { Case } from "@/lib/mju-models";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: string; name?: string; caseType?: "advisory" | "litigation" };
    const cwd = body.cwd;
    if (!cwd || !existsSync(cwd)) {
      return NextResponse.json({ error: "cwd does not exist" }, { status: 400 });
    }

    const name = body.name?.trim() || cwd.split("/").filter(Boolean).pop() || "Mju 项目";
    const store = initStore(cwd, name, body.caseType);

    // 如果目录是 Obsidian vault，自动扫描并导入案卷
    if (isObsidianVault(cwd)) {
      store.isObsidianVault = true;
      const candidates = scanObsidianCases(cwd);
      const existingPaths = new Set(store.cases.map((c) => c.vaultPath));
      const now = new Date().toISOString();

      for (const candidate of candidates) {
        if (existingPaths.has(candidate.vaultPath)) continue;
        const newCase: Case = {
          id: crypto.randomUUID(),
          title: candidate.title,
          type: candidate.type,
          stage: candidate.stage,
          status: candidate.status,
          vaultPath: candidate.vaultPath,
          createdAt: now,
        };
        store.cases.push(newCase);
      }
      writeStore(cwd, store);
    }

    return NextResponse.json({ success: true, store });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const cwd = new URL(req.url).searchParams.get("cwd");
  if (!cwd) {
    return NextResponse.json({ error: "cwd required" }, { status: 400 });
  }
  const store = readStore(cwd);
  if (!store) {
    return NextResponse.json({ error: "Mju project not initialized" }, { status: 404 });
  }
  return NextResponse.json({ store });
}
