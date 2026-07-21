import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ModelRuntime, getAgentDir } from "@earendil-works/pi-coding-agent";
import { invalidateModelsCache } from "@/lib/models-cache";

export const dynamic = "force-dynamic";

function modelsPath(): string { return join(getAgentDir(), "models.json"); }

function readConfig(): Record<string, unknown> {
  try { return JSON.parse(readFileSync(modelsPath(), "utf8")) as Record<string, unknown>; }
  catch { return { providers: {} }; }
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "account";
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { provider?: string; accountName?: string; apiKey?: string };
    const providerId = body.provider?.trim() ?? "";
    const apiKey = body.apiKey?.trim() ?? "";
    if (!providerId || !apiKey) return Response.json({ error: "provider and apiKey are required" }, { status: 400 });

    const runtime = await ModelRuntime.create();
    const source = runtime.getProvider(providerId);
    const sourceModels = runtime.getModels(providerId);
    if (!source || sourceModels.length === 0) return Response.json({ error: `Provider not found: ${providerId}` }, { status: 404 });

    const config = readConfig();
    const providers = (config.providers && typeof config.providers === "object" ? config.providers : {}) as Record<string, Record<string, unknown>>;
    const baseName = `${providerId}-${slug(body.accountName || "account")}`;
    let alias = baseName;
    let index = 2;
    while (providers[alias]) alias = `${baseName}-${index++}`;

    const firstModel = sourceModels[0];
    providers[alias] = {
      name: body.accountName?.trim() || `${source.name} account`,
      baseUrl: source.baseUrl ?? firstModel.baseUrl,
      api: firstModel.api,
      apiKey,
      ...(source.headers ? { headers: source.headers } : {}),
      models: sourceModels.map((model) => ({
        id: model.id,
        name: model.name,
        api: model.api,
        reasoning: model.reasoning,
        ...(model.thinkingLevelMap ? { thinkingLevelMap: model.thinkingLevelMap } : {}),
        input: model.input,
        cost: model.cost,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        ...(model.headers ? { headers: model.headers } : {}),
        ...(model.compat ? { compat: model.compat } : {}),
      })),
    };

    const path = modelsPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ ...config, providers }, null, 2), "utf8");
    invalidateModelsCache();
    return Response.json({ success: true, providerName: alias, displayName: providers[alias].name });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
