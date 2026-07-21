import { invalidateModelsCache } from "@/lib/models-cache";
import { isModelVisible, readModelVisibility, writeModelVisibility } from "@/lib/model-visibility";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ providers: readModelVisibility() });
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as { provider?: string; modelId?: string; enabled?: boolean };
    const provider = body.provider?.trim();
    const modelId = body.modelId?.trim();
    if (!provider || !modelId || typeof body.enabled !== "boolean") {
      return Response.json({ error: "provider, modelId and enabled are required" }, { status: 400 });
    }
    const providers = readModelVisibility();
    const models = { ...(providers[provider] ?? {}) };
    models[modelId] = body.enabled;
    providers[provider] = models;
    writeModelVisibility(providers);
    invalidateModelsCache();
    return Response.json({ success: true, visible: isModelVisible(providers, provider, modelId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
