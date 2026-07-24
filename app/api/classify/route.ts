import { NextResponse } from "next/server";
import { completeSimple, type AssistantMessage } from "@earendil-works/pi-ai/compat";
import { createAgentSessionServices, getAgentDir } from "@earendil-works/pi-coding-agent";
import { getProjectStore, isProjectStore } from "@/lib/mju-route-utils";
import { INBOX_CASE_STAGE } from "@/lib/mju-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLASSIFY_TIMEOUT_MS = 15_000;

function getAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * POST { cwd, instruction } → { caseId } | { caseId: null }
 *
 * AI fallback for case attribution when the entry page's local substring match
 * finds nothing. Sends the project's case list + instruction to the default
 * model and asks for a 1-based index; 0 / unparseable → null (inbox).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: unknown; instruction?: unknown };
    const project = getProjectStore(typeof body.cwd === "string" ? body.cwd : null);
    if (!isProjectStore(project)) return project.response;
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction) return NextResponse.json({ error: "instruction required" }, { status: 400 });

    // The inbox is the fallback outcome, never a classification candidate.
    const candidates = project.store.cases.filter((c) => c.stage !== INBOX_CASE_STAGE && c.status !== "closed");
    if (candidates.length === 0) return NextResponse.json({ caseId: null });

    const services = await createAgentSessionServices({ cwd: project.cwd, agentDir: getAgentDir() });
    const provider = services.settingsManager.getDefaultProvider();
    const modelId = services.settingsManager.getDefaultModel();
    if (!provider || !modelId) return NextResponse.json({ caseId: null, error: "no default model" });
    const model = services.modelRuntime.getModel(provider, modelId);
    if (!model) return NextResponse.json({ caseId: null, error: "default model not found" });
    const resolved = await services.modelRuntime.getAuth(model);
    if (!resolved?.auth.apiKey) return NextResponse.json({ caseId: null, error: "no api key" });

    const caseLines = candidates.map((c, i) => {
      const parties = [c.parties?.plaintiff, c.parties?.defendant, ...(c.parties?.other ?? [])].filter(Boolean).join("、");
      const type = c.type === "litigation" ? "诉讼" : "顾问";
      return `${i + 1}. ${c.title}（${type}，阶段：${c.stage}${parties ? `，当事人：${parties}` : ""}）`;
    }).join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
    try {
      const message = await completeSimple(model, {
        messages: [{
          role: "user",
          content: `你是案件归属分类器。判断用户指令最可能属于下面哪个案件。\n\n案件列表：\n${caseLines}\n\n只回复最匹配案件的编号（1-${candidates.length}）；如果都不相关，回复 0。不要输出任何其他内容。\n\n用户指令：${instruction.slice(0, 500)}`,
          timestamp: Date.now(),
        }],
      }, {
        apiKey: resolved.auth.apiKey,
        headers: resolved.auth.headers,
        maxTokens: 8,
        timeoutMs: CLASSIFY_TIMEOUT_MS,
        maxRetries: 0,
        cacheRetention: "none",
        signal: controller.signal,
      });
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        return NextResponse.json({ caseId: null, error: message.errorMessage ?? "classify aborted" });
      }
      const text = getAssistantText(message).trim();
      const match = /(\d+)/.exec(text);
      const index = match ? Number(match[1]) : 0;
      const caseId = index >= 1 && index <= candidates.length ? candidates[index - 1].id : null;
      return NextResponse.json({ caseId });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json({ caseId: null, error: error instanceof Error ? error.message : String(error) });
  }
}
