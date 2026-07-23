import { ModelRuntime } from "@earendil-works/pi-coding-agent";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const provider = new URL(req.url).searchParams.get("provider")?.trim();
  if (!provider) return Response.json({ error: "provider is required" }, { status: 400 });
  const runtime = await ModelRuntime.create();
  const models = runtime.getModels(provider).map((model) => ({
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
  }));
  return Response.json({ provider, models });
}
