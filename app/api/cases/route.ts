import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { readStore, writeStore, ensureInboxCase } from "@/lib/mju-store";
import { ensureCanonicalStructure, ensureCaseSkeleton, hasCanonicalStructure } from "@/lib/mju-guidance";
import { DEFAULT_LITIGATION_STAGES, litigationStageIndexFor, normalizeLitigationStageIndex, type Case, type CaseType } from "@/lib/mju-models";
import { isNonEmptyString } from "@/lib/mju-route-utils";

export const runtime = "nodejs";

function getCaseBaseDir(cwd: string, type: CaseType, isObsidian: boolean): string {
  // Canonical ops/ layout applies to Obsidian vaults and plain folders alike.
  // For plain folders that do not have it yet, create it on demand.
  if (!isObsidian && !hasCanonicalStructure(cwd)) {
    ensureCanonicalStructure(cwd);
  }
  return type === "litigation"
    ? join(cwd, "ops", "cases", "案卷")
    : join(cwd, "ops", "projects", "活跃项目");
}

function parseCaseType(value: unknown): CaseType {
  if (value === "advisory" || value === "litigation" || value === "project") return value;
  return "advisory";
}

type CaseBody = Partial<Case> & {
  cwd?: string;
  action?: "ensure_inbox" | "undo" | "undo_stage" | "next" | "previous";
};

function validStageIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function GET(req: Request) {
  const cwd = new URL(req.url).searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
  const store = readStore(cwd);
  if (!store) return NextResponse.json({ error: "Mju project not initialized" }, { status: 404 });
  return NextResponse.json({ cases: store.cases, clients: store.clients });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as CaseBody;
    if (!isNonEmptyString(body.cwd)) return NextResponse.json({ error: "cwd does not exist" }, { status: 400 });
    const store = readStore(body.cwd);
    if (!store) return NextResponse.json({ error: "Mju project not initialized" }, { status: 404 });
    if (!isNonEmptyString(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 });
    const index = store.cases.findIndex((caseItem) => caseItem.id === body.id);
    if (index < 0) return NextResponse.json({ error: "case not found" }, { status: 404 });

    const current = store.cases[index];
    if (current.type !== "litigation") {
      return NextResponse.json({ error: "stage updates require a litigation case" }, { status: 400 });
    }
    const undo = body.action === "undo" || body.action === "undo_stage";
    const move = body.action === "next" || body.action === "previous";
    if (body.stage !== undefined || (body.stageIndex === undefined && !undo && !move)) {
      return NextResponse.json({ error: "stageIndex required" }, { status: 400 });
    }
    if (body.action !== undefined && !undo && !move) {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }
    if (body.stageIndex !== undefined && !validStageIndex(body.stageIndex)) {
      return NextResponse.json({ error: "invalid stageIndex" }, { status: 400 });
    }

    const history = [...(current.stageHistory ?? [])];
    if (undo) history.pop();
    const currentIndex = normalizeLitigationStageIndex(current.stageIndex ?? litigationStageIndexFor(current.stage));
    const targetIndex = undo
      ? history.at(-1)?.stageIndex
      : body.action === "next"
        ? currentIndex + 1
        : body.action === "previous"
          ? currentIndex - 1
          : normalizeLitigationStageIndex(body.stageIndex);
    if (targetIndex === undefined) return NextResponse.json({ error: "no stage update to undo" }, { status: 409 });
    const stageIndex = normalizeLitigationStageIndex(targetIndex);
    const stage = DEFAULT_LITIGATION_STAGES[stageIndex];
    if (!undo && history.at(-1)?.stageIndex !== stageIndex) {
      history.push({ stageIndex, stage, changedAt: new Date().toISOString() });
    }

    const next: Case = { ...current, stage, stageIndex, stageHistory: history };
    store.cases[index] = next;
    writeStore(body.cwd, store);
    return NextResponse.json({ success: true, case: next });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as CaseBody;
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
    const type = parseCaseType(body.type);

    const baseDir = getCaseBaseDir(cwd, type, Boolean(store.isObsidianVault));
    const caseDir = join(baseDir, title);
    mkdirSync(caseDir, { recursive: true });
    ensureCaseSkeleton(caseDir, title, type);

    if (type === "litigation" && body.stage !== undefined && !isNonEmptyString(body.stage)) {
      return NextResponse.json({ error: "stage cannot be empty" }, { status: 400 });
    }
    if (type === "litigation" && body.stageIndex !== undefined && !validStageIndex(body.stageIndex)) {
      return NextResponse.json({ error: "invalid stageIndex" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const stageIndex = type === "litigation"
      ? normalizeLitigationStageIndex(body.stageIndex ?? litigationStageIndexFor(body.stage))
      : undefined;
    const newCase: Case = {
      id: crypto.randomUUID(),
      title,
      type,
      stage: type === "litigation" ? DEFAULT_LITIGATION_STAGES[stageIndex!] : body.stage || "收案",
      stageIndex,
      stageHistory: type === "litigation"
        ? [{ stageIndex: stageIndex!, stage: DEFAULT_LITIGATION_STAGES[stageIndex!], changedAt: now }]
        : undefined,
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
