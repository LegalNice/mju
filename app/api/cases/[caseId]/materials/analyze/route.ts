import { NextResponse } from "next/server";
import { analyzeCaseMaterials } from "@/lib/material-analysis";
import { findCase, getProjectStore, isNonEmptyString, isProjectStore } from "@/lib/mju-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await params;
    const { searchParams } = new URL(request.url);
    const cwd = searchParams.get("cwd");

    if (!isNonEmptyString(cwd)) {
      return NextResponse.json({ error: "cwd required" }, { status: 400 });
    }
    const project = getProjectStore(cwd);
    if (!isProjectStore(project)) return project.response;

    const caseItem = findCase(project.store, caseId);
    if (!caseItem) {
      return NextResponse.json({ error: "case not found" }, { status: 404 });
    }

    const result = analyzeCaseMaterials(project, caseItem);
    if (!result) {
      return NextResponse.json({ error: "no materials to analyze" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
