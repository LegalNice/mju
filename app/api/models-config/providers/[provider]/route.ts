import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ModelRuntime, getAgentDir } from "@earendil-works/pi-coding-agent";
import { invalidateModelsCache } from "@/lib/models-cache";
import { setProviderDeleted } from "@/lib/provider-state";

export const dynamic = "force-dynamic";

function modelsPath(): string {
  return join(getAgentDir(), "models.json");
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!provider?.trim()) return Response.json({ error: "provider is required" }, { status: 400 });

  try {
    const runtime = await ModelRuntime.create();
    if (runtime.getProvider(provider)?.auth.apiKey) await runtime.logout(provider);

    const path = modelsPath();
    if (existsSync(path)) {
      const config = JSON.parse(readFileSync(path, "utf8")) as { providers?: Record<string, unknown> };
      const providers = { ...(config.providers ?? {}) };
      const existed = Object.prototype.hasOwnProperty.call(providers, provider);
      delete providers[provider];
      if (existed) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify({ ...config, providers }, null, 2), "utf8");
      }
    }
    // Environment credentials cannot be deleted from the parent process. Keep
    // a LegalNice-level tombstone so the provider stays hidden until re-added.
    setProviderDeleted(provider, true);
    invalidateModelsCache();
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
