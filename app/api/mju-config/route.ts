import { NextResponse } from "next/server";
import { parseModelRef, readMjuConfig, writeMjuConfig } from "@/lib/mju-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { classifyModel: string | null } — null means automatic selection. */
export async function GET() {
  return NextResponse.json({ classifyModel: readMjuConfig().classifyModel ?? null });
}

/** PUT { classifyModel: "provider/id" | null } — null restores automatic selection. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null) as { classifyModel?: unknown } | null;
  const value = body?.classifyModel;
  if (value !== null && (typeof value !== "string" || !parseModelRef(value))) {
    return NextResponse.json({ error: 'classifyModel must be "provider/id" or null' }, { status: 400 });
  }
  writeMjuConfig({ classifyModel: value ?? undefined });
  return NextResponse.json({ success: true });
}
