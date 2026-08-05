import { NextResponse } from "next/server";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import { getProjectStore, isProjectStore } from "@/lib/mju-route-utils";
import { getAssistantText, resolveSimpleModel } from "@/lib/mju-ai";
import { scanLegacyCases, type LegacyCaseCandidate } from "@/lib/case-migration";
import { DEFAULT_LITIGATION_STAGES, litigationStageIndexFor, type CaseStatus, type CaseType } from "@/lib/mju-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFINE_TIMEOUT_MS = 15_000;
const MAX_REFINE_CANDIDATES = 20;

interface AiRefinement {
  title?: string;
  type?: CaseType;
  status?: CaseStatus;
  stage?: string;
  plaintiff?: string;
  defendant?: string;
  court?: string;
  caseNumber?: string;
}

/** 从模型输出中提取第一个 JSON 数组，容忍前后杂文本。 */
function parseJsonArray(text: string): AiRefinement[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is AiRefinement => Boolean(item) && typeof item === "object");
  } catch {
    return null;
  }
}

function isCaseType(value: unknown): value is CaseType {
  return value === "advisory" || value === "litigation" || value === "project";
}

function isCaseStatus(value: unknown): value is CaseStatus {
  return value === "active" || value === "dormant" || value === "closed";
}

/**
 * AI 精修：把候选文件夹的名称与文件名样本发给轻量模型，批量推断
 * 案件名称/类型/状态/阶段/当事人/法院/案号。任何失败都由调用方降级。
 */
async function refineCandidates(
  cwd: string,
  candidates: LegacyCaseCandidate[],
): Promise<{ refined: boolean; model?: string }> {
  if (candidates.length === 0) return { refined: false };
  const { resolution } = await resolveSimpleModel(cwd);
  if (!resolution) return { refined: false };

  const targets = candidates.slice(0, MAX_REFINE_CANDIDATES);
  const lines = targets.map((c, i) => {
    const samples = c.sampleFiles.slice(0, 30).join("、") || "（空文件夹）";
    return `${i + 1}. 文件夹「${c.title}」：${samples}`;
  }).join("\n");
  const stageList = DEFAULT_LITIGATION_STAGES.join("/");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REFINE_TIMEOUT_MS);
  try {
    const message = await completeSimple(resolution.model, {
      messages: [{
        role: "user",
        content: `你是律师事务所的案件整理助手。下面是若干既有案件文件夹的名称和其中的文件名，请逐个推断案件信息。

${lines}

回复一个 JSON 数组（不要输出任何其他内容），每个元素对应一个文件夹：
[{"title":"规范案件名（如 张三诉李四买卖合同纠纷）","type":"litigation|advisory|project","status":"active|dormant|closed","stage":"${stageList} 之一","plaintiff":"原告或空字符串","defendant":"被告或空字符串","court":"受理法院或空字符串","caseNumber":"案号或空字符串"}]
- litigation=诉讼案件，advisory=法律顾问/常顾，project=专项非诉
- 无法确定的字段写空字符串；顾问/专项的 stage 写空字符串`,
        timestamp: Date.now(),
      }],
    }, {
      apiKey: resolution.apiKey,
      headers: resolution.headers,
      maxTokens: 1200,
      timeoutMs: REFINE_TIMEOUT_MS,
      maxRetries: 0,
      cacheRetention: "none",
      signal: controller.signal,
    });
    if (message.stopReason === "error" || message.stopReason === "aborted") return { refined: false };
    const refinements = parseJsonArray(getAssistantText(message).trim());
    if (!refinements) return { refined: false };

    let touched = 0;
    targets.forEach((candidate, index) => {
      const refine = refinements[index];
      if (!refine) return;
      if (typeof refine.title === "string" && refine.title.trim()) candidate.title = refine.title.trim();
      if (isCaseType(refine.type)) candidate.type = refine.type;
      if (isCaseStatus(refine.status)) candidate.status = refine.status;
      if (candidate.type === "litigation" && typeof refine.stage === "string") {
        const stageIndex = litigationStageIndexFor(refine.stage.trim());
        if (stageIndex !== undefined) {
          candidate.stageIndex = stageIndex;
          candidate.stage = DEFAULT_LITIGATION_STAGES[stageIndex];
        }
      }
      if (typeof refine.plaintiff === "string" && refine.plaintiff.trim()) {
        candidate.parties = { ...candidate.parties, plaintiff: refine.plaintiff.trim() };
      }
      if (typeof refine.defendant === "string" && refine.defendant.trim()) {
        candidate.parties = { ...candidate.parties, defendant: refine.defendant.trim() };
      }
      if (typeof refine.court === "string" && refine.court.trim()) candidate.court = refine.court.trim();
      if (typeof refine.caseNumber === "string" && refine.caseNumber.trim()) candidate.caseNumber = refine.caseNumber.trim();
      touched += 1;
    });
    return touched > 0
      ? { refined: true, model: `${resolution.provider}/${resolution.modelId}` }
      : { refined: false };
  } catch {
    return { refined: false };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * POST { cwd, quick? } → { candidates, looseFiles, refined, model? }
 *
 * 规则预扫描既有"案件样"文件夹，随后尽力做一次 AI 精修；
 * 无模型/无 key/超时/解析失败时降级为纯规则草案（refined: false）。
 * quick: true 时跳过 AI 精修，用于初始化后的低成本预检。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: unknown; quick?: unknown };
    const project = getProjectStore(typeof body.cwd === "string" ? body.cwd : null);
    if (!isProjectStore(project)) return project.response;

    const scan = scanLegacyCases(project.cwd, project.store);
    if (body.quick === true) return NextResponse.json({ ...scan, refined: false });
    const { refined, model } = await refineCandidates(project.cwd, scan.candidates);
    return NextResponse.json({ ...scan, refined, model });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
