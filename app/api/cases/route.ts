import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { readStore, writeStore, ensureInboxCase } from "@/lib/mju-store";
import type { Case, CaseType } from "@/lib/mju-models";

export const runtime = "nodejs";

function getCaseBaseDir(cwd: string, type: CaseType, isObsidian: boolean): string {
  if (isObsidian) {
    return type === "litigation"
      ? join(cwd, "ops", "cases", "案卷")
      : join(cwd, "ops", "projects", "活跃项目");
  }
  return join(cwd, "cases");
}

export async function GET(req: Request) {
  const cwd = new URL(req.url).searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
  const store = readStore(cwd);
  if (!store) return NextResponse.json({ error: "Mju project not initialized" }, { status: 404 });
  return NextResponse.json({ cases: store.cases, clients: store.clients });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<Case> & { cwd?: string; action?: string };
    const cwd = body.cwd;
    if (!cwd || !existsSync(cwd)) {
      return NextResponse.json({ error: "cwd does not exist" }, { status: 400 });
    }
    const store = readStore(cwd);
    if (!store) {
      return NextResponse.json({ error: "Mju project not initialized" }, { status: 404 });
    }

    // 通用任务收件箱：按需创建（幂等）
    if (body.action === "ensure_inbox") {
      const inbox = ensureInboxCase(cwd, store);
      return NextResponse.json({ success: true, case: inbox });
    }

    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const type = body.type || "advisory";

    const baseDir = getCaseBaseDir(cwd, type, Boolean(store.isObsidianVault));
    const caseDir = join(baseDir, title);
    mkdirSync(caseDir, { recursive: true });

    const now = new Date().toISOString();
    const newCase: Case = {
      id: crypto.randomUUID(),
      title,
      type,
      stage: body.stage || "收案",
      status: "active",
      vaultPath: caseDir,
      clientId: body.clientId,
      parties: body.parties,
      court: body.court,
      caseNumber: body.caseNumber,
      createdAt: now,
    };

    store.cases.push(newCase);
    writeStore(cwd, store);
    return NextResponse.json({ success: true, case: newCase });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
