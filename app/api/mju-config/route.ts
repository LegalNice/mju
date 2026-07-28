import { NextResponse } from "next/server";
import { parseModelRef, readMjuConfig, writeMjuConfig, type MjuConfig } from "@/lib/mju-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → full MjuConfig (excluding sensitive values is unnecessary for a local app). */
export async function GET() {
  const config = readMjuConfig();
  return NextResponse.json({
    classifyModel: config.classifyModel ?? null,
    agents: config.agents ?? null,
    docx: config.docx ?? null,
    mineru: config.mineru ?? null,
  });
}

function isValidMineruConfig(value: unknown): value is NonNullable<MjuConfig["mineru"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const cfg = value as Record<string, unknown>;
  if (cfg.apiToken !== undefined && typeof cfg.apiToken !== "string") return false;
  if (cfg.modelVersion !== undefined && !["pipeline", "vlm", "MinerU-HTML"].includes(cfg.modelVersion as string)) return false;
  for (const key of ["enableOcr", "enableTable", "enableFormula"]) {
    const v = cfg[key];
    if (v !== undefined && typeof v !== "boolean") return false;
  }
  return true;
}

/** PUT { classifyModel?, agents?, docx?, mineru? } — null deletes the key. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null) as Partial<{
    classifyModel: unknown;
    agents: unknown;
    docx: unknown;
    mineru: unknown;
  }> | null;
  if (!body) return NextResponse.json({ error: "invalid JSON" }, { status: 400 });

  const patch: Partial<MjuConfig> = {};

  if ("classifyModel" in body) {
    const value = body.classifyModel;
    if (value !== null && (typeof value !== "string" || !parseModelRef(value))) {
      return NextResponse.json({ error: 'classifyModel must be "provider/id" or null' }, { status: 400 });
    }
    patch.classifyModel = value ?? undefined;
  }

  if ("agents" in body) {
    const value = body.agents;
    if (value !== null && (!value || typeof value !== "object" || Array.isArray(value))) {
      return NextResponse.json({ error: "agents must be an object or null" }, { status: 400 });
    }
    patch.agents = value === null ? undefined : value as NonNullable<MjuConfig["agents"]>;
  }

  if ("docx" in body) {
    const value = body.docx;
    if (value !== null && (!value || typeof value !== "object" || Array.isArray(value))) {
      return NextResponse.json({ error: "docx must be an object or null" }, { status: 400 });
    }
    patch.docx = value === null ? undefined : value as NonNullable<MjuConfig["docx"]>;
  }

  if ("mineru" in body) {
    const value = body.mineru;
    if (value !== null && !isValidMineruConfig(value)) {
      return NextResponse.json({ error: "mineru must be a valid config object or null" }, { status: 400 });
    }
    patch.mineru = value === null ? undefined : value;
  }

  writeMjuConfig(patch);
  return NextResponse.json({ success: true });
}
