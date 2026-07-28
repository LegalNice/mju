import { NextResponse } from "next/server";
import { createAgentSessionServices, getAgentDir } from "@earendil-works/pi-coding-agent";
import { invalidateModelsCache } from "@/lib/models-cache";

export const dynamic = "force-dynamic";

// POST { provider, modelId } — persist the default model to
// ~/.pi/agent/settings.json so new sessions (and ChatInput's preselect)
// pick it up without the user re-selecting every time.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { provider?: string; modelId?: string };
    const provider = body.provider?.trim();
    const modelId = body.modelId?.trim();
    if (!provider || !modelId) {
      return NextResponse.json({ error: "provider and modelId required" }, { status: 400 });
    }
    const services = await createAgentSessionServices({ cwd: process.cwd(), agentDir: getAgentDir() });
    services.settingsManager.setDefaultModelAndProvider(provider, modelId);
    invalidateModelsCache();
    return NextResponse.json({ success: true, defaultModel: { provider, modelId } });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
