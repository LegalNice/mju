import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { readStore, writeStore, ensureInboxCase } from "@/lib/mju-store";
import { ensureCanonicalStructure, ensureCaseSkeleton, hasCanonicalStructure } from "@/lib/mju-guidance";
import { DEFAULT_LITIGATION_STAGES, litigationStageIndexFor, normalizeStageIndex, resolveCaseStages, type Case, type CaseType } from "@/lib/mju-models";
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
  action?: "ensure_inbox" | "undo" | "undo_stage" | "next" | "previous" | "note" | "set_stages";
  /** 阶段大事记：随 next/previous 附带，或配合 action="note" 补录。 */
  note?: string;
  /** action="set_stages" 时的自定义阶段标签列表。 */
  stages?: string[];
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
    const setNote = body.action === "note";
    const setStages = body.action === "set_stages";
    if (body.stage !== undefined || (body.stageIndex === undefined && !undo && !move && !setNote && !setStages)) {
      return NextResponse.json({ error: "stageIndex required" }, { status: 400 });
    }
    if (body.action !== undefined && !undo && !move && !setNote && !setStages) {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }
    if (body.stageIndex !== undefined && !validStageIndex(body.stageIndex)) {
      return NextResponse.json({ error: "invalid stageIndex" }, { status: 400 });
    }

    const stages = resolveCaseStages(current);
    const history = [...(current.stageHistory ?? [])];

    // 自定义阶段：整组替换（1–20 个非空标签，去重）
    if (setStages) {
      const raw = Array.isArray(body.stages) ? body.stages : null;
      if (
        !raw ||
        raw.length < 1 ||
        raw.length > 20 ||
        raw.some((s) => typeof s !== "string" || s.trim().length === 0)
      ) {
        return NextResponse.json({ error: "invalid stages" }, { status: 400 });
      }
      const seen = new Set<string>();
      const labels: string[] = [];
      for (const label of raw) {
        const trimmed = label.trim();
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          labels.push(trimmed);
        }
      }
      const stageIndex = normalizeStageIndex(current.stageIndex ?? 0, labels.length);
      const next: Case = {
        ...current,
        customStages: labels,
        stage: labels[stageIndex],
        stageIndex,
      };
      store.cases[index] = next;
      writeStore(body.cwd, store);
      return NextResponse.json({ success: true, case: next });
    }

    // 阶段补记：给某阶段的历史条目写/改大事记（无该条目时按需创建）
    if (setNote) {
      if (!validStageIndex(body.stageIndex) || typeof body.note !== "string") {
        return NextResponse.json({ error: "stageIndex and note required" }, { status: 400 });
      }
      const note = body.note.trim();
      const noteIndex = history.findIndex((entry) => entry.stageIndex === body.stageIndex);
      if (noteIndex >= 0) {
        history[noteIndex] = { ...history[noteIndex], note: note || undefined };
      } else if (note) {
        history.push({
          stageIndex: body.stageIndex,
          stage: stages[body.stageIndex] ?? current.stage,
          changedAt: new Date().toISOString(),
          note,
        });
      }
      const next: Case = { ...current, stageHistory: history };
      store.cases[index] = next;
      writeStore(body.cwd, store);
      return NextResponse.json({ success: true, case: next });
    }

    if (undo) history.pop();
    const currentIndex = normalizeStageIndex(
      current.stageIndex ?? litigationStageIndexFor(current.stage) ?? 0,
      stages.length,
    );
    const targetIndex = undo
      ? history.at(-1)?.stageIndex
      : body.action === "next"
        ? currentIndex + 1
        : body.action === "previous"
          ? currentIndex - 1
          : normalizeStageIndex(body.stageIndex, stages.length);
    if (targetIndex === undefined) return NextResponse.json({ error: "no stage update to undo" }, { status: 409 });
    const stageIndex = normalizeStageIndex(targetIndex, stages.length);
    const stage = stages[stageIndex];
    if (!undo) {
      // 推进/回退时，可选的大事记附着到「刚结束」的阶段（history 末条）
      const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;
      if (note && history.length > 0) {
        const last = history.length - 1;
        history[last] = { ...history[last], note };
      }
      if (history.at(-1)?.stageIndex !== stageIndex) {
        history.push({ stageIndex, stage, changedAt: new Date().toISOString() });
      }
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
    const customStages = type === "litigation" && Array.isArray(body.customStages) && body.customStages.length > 0
      ? body.customStages.map((s) => s.trim()).filter((s) => s.length > 0)
      : undefined;
    const stageList = customStages ?? DEFAULT_LITIGATION_STAGES;
    const stageIndex = type === "litigation"
      ? normalizeStageIndex(body.stageIndex ?? litigationStageIndexFor(body.stage), stageList.length)
      : undefined;
    const newCase: Case = {
      id: crypto.randomUUID(),
      title,
      type,
      stage: type === "litigation" ? stageList[stageIndex!] : body.stage || "收案",
      stageIndex,
      customStages,
      stageHistory: type === "litigation"
        ? [{ stageIndex: stageIndex!, stage: stageList[stageIndex!], changedAt: now }]
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
