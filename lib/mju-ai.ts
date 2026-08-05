import type { AssistantMessage } from "@earendil-works/pi-ai/compat";
import { createAgentSessionServices, getAgentDir } from "@earendil-works/pi-coding-agent";
import { parseModelRef, readMjuConfig } from "@/lib/mju-config";

/**
 * Shared resolution of a lightweight text-completion model for small
 * server-side AI tasks (case attribution, legacy-case refinement, …).
 *
 * Preference order mirrors the classify route: ~/.mju/config.json
 * classifyModel ("provider/id", must be available), MJU_CLASSIFY_MODEL env,
 * known fast models, then the chat default. Returns null (with a reason)
 * whenever a usable authenticated model cannot be resolved — callers are
 * expected to degrade gracefully to rule-based behavior.
 */
export interface SimpleModelResolution {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  provider: string;
  modelId: string;
  apiKey: string;
  headers?: Record<string, string | null>;
}

export type SimpleModelError = "no default model" | "default model not found" | "no api key";

export async function resolveSimpleModel(
  cwd: string,
): Promise<{ resolution: SimpleModelResolution; error?: undefined } | { resolution?: undefined; error: SimpleModelError }> {
  const services = await createAgentSessionServices({ cwd, agentDir: getAgentDir() });
  const available = await services.modelRuntime.getAvailable();
  const pickFast = (): { provider: string; id: string } | null => {
    for (const ref of [readMjuConfig().classifyModel, process.env.MJU_CLASSIFY_MODEL]) {
      if (!ref) continue;
      const parsed = parseModelRef(ref);
      if (parsed && available.some((m) => m.provider === parsed.provider && m.id === parsed.id)) return parsed;
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
  if (!provider || !modelId) return { error: "no default model" };
  const model = services.modelRuntime.getModel(provider, modelId);
  if (!model) return { error: "default model not found" };
  const resolved = await services.modelRuntime.getAuth(model);
  if (!resolved?.auth.apiKey) return { error: "no api key" };
  return {
    resolution: {
      model,
      provider,
      modelId,
      apiKey: resolved.auth.apiKey,
      headers: resolved.auth.headers,
    },
  };
}

/** Concatenate the text blocks of an assistant message. */
export function getAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}
