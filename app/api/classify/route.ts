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
    // Classification is a tiny task — prefer a fast model over the (possibly
    // huge reasoning) chat default. Preference order: MJU_CLASSIFY_MODEL env
    // ("provider/id"), known fast models, then the chat default.
    const available = await services.modelRuntime.getAvailable();
    const pickFast = (): { provider: string; id: string } | null => {
      const envRef = process.env.MJU_CLASSIFY_MODEL;
      if (envRef) {
        const [p, ...rest] = envRef.split("/");
        const id = rest.join("/");
        if (p && id && available.some((m) => m.provider === p && m.id === id)) return { provider: p, id };
      }
      for (const ref of ["gpt-5.4-mini", "gpt-5.3-codex-spark"]) {
        const hit = available.find((m) => m.id === ref);
        if (hit) return { provider: hit.provider, id: hit.id };
      }
      return null;
    };
    const fast = pickFast();
    const provider = fast?.provider ?? services.settingsManager.getDefaultProvider();
    const modelId = fast?.id ?? services.settingsManager.getDefaultModel();
    if (!provider || !modelId) return NextResponse.json({ caseId: null, error: "no default model" });
    const model = services.modelRuntime.getModel(provider, modelId);
    if (!model) return NextResponse.json({ caseId: null, error: "default model not found" });
    const resolved = await services.modelRuntime.getAuth(model);
    if (!resolved?.auth.apiKey) return NextResponse.json({ caseId: null, error: "no api key" });

    const caseLines = candidates.map((c, i) => {
      const parties = [c.parties?.plaintiff, c.parties?.defendant, ...(c.parties?.other ?? [])].filter(Boolean).join("、");
      return `${i + 1}. ${c.title}${parties ? `（${parties}）` : ""}`;
    }).join("\n");
    const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
    try {
      const message = await completeSimple(model, {
        messages: [{
          role: "user",
          content: `判断用户指令属于哪个案件，并提取截止时间。\n\n案件列表：\n${caseLines}\n\n回复格式：编号|截止时间\n- 编号：最匹配案件的编号（1-${candidates.length}），都不相关回复 0\n- 截止时间：指令中提到的日期或期限，换算为 YYYY-MM-DD（今天是${today}）；没提到写 无\n- 只输出这一行，不要任何其他内容\n\n用户指令：${instruction.slice(0, 500)}`,
          timestamp: Date.now(),
        }],
      }, {
        apiKey: resolved.auth.apiKey,
        headers: resolved.auth.headers,
        maxTokens: 24,
        timeoutMs: CLASSIFY_TIMEOUT_MS,
        maxRetries: 0,
        cacheRetention: "none",
        signal: controller.signal,
      });
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        return NextResponse.json({ caseId: null, error: message.errorMessage ?? "classify aborted" });
      }
      const text = getAssistantText(message).trim();
      const [indexPart, deadlinePart] = text.split("|").map((s) => s.trim());
      const match = /(\d+)/.exec(indexPart ?? "");
      const index = match ? Number(match[1]) : 0;
      const caseId = index >= 1 && index <= candidates.length ? candidates[index - 1].id : null;
      const deadlineMatch = /(\d{4}-\d{2}-\d{2})/.exec(deadlinePart ?? "");
      return NextResponse.json({ caseId, deadline: deadlineMatch?.[1] ?? null, model: `${provider}/${modelId}` });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json({ caseId: null, error: error instanceof Error ? error.message : String(error) });
  }
}
