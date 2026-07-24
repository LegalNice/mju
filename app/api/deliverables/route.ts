import { NextResponse } from "next/server";
import { writeStore } from "@/lib/mju-store";
import type { Deliverable, DeliverableStatus, DeliverableType } from "@/lib/mju-models";
import { findCase, getProjectStore, isNonEmptyString, isOptionalString, isProjectStore } from "@/lib/mju-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deliverableStatuses = new Set<DeliverableStatus>(["draft", "internal-review", "client-review", "final", "archived"]);
const deliverableTypes = new Set<DeliverableType>([
  "internal-opinion", "external-opinion", "docx-revision", "pleading", "evidence-list", "trial-outline", "research-report", "other",
]);

type DeliverableBody = Partial<Deliverable> & { cwd?: string };

function validStatus(value: unknown): value is DeliverableStatus {
  return typeof value === "string" && deliverableStatuses.has(value as DeliverableStatus);
}

function validType(value: unknown): value is DeliverableType {
  return typeof value === "string" && deliverableTypes.has(value as DeliverableType);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const project = getProjectStore(params.get("cwd"));
  if (!isProjectStore(project)) return project.response;
  const caseId = params.get("caseId");
  const taskId = params.get("taskId");
  const deliverables = project.store.deliverables
    .filter((d) => !caseId || d.caseId === caseId)
    .filter((d) => !taskId || d.taskId === taskId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ deliverables });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as DeliverableBody;
    const project = getProjectStore(body.cwd);
    if (!isProjectStore(project)) return project.response;
    if (!isNonEmptyString(body.caseId) || !findCase(project.store, body.caseId)) {
      return NextResponse.json({ error: "valid caseId required" }, { status: 400 });
    }
    if (!isNonEmptyString(body.title) || !isNonEmptyString(body.filePath)) {
      return NextResponse.json({ error: "title and filePath required" }, { status: 400 });
    }
    if (body.status !== undefined && !validStatus(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    if (body.type !== undefined && !validType(body.type)) return NextResponse.json({ error: "invalid type" }, { status: 400 });
    if (!isOptionalString(body.taskId)) return NextResponse.json({ error: "taskId must be a string" }, { status: 400 });

    const deliverable: Deliverable = {
      id: crypto.randomUUID(),
      caseId: body.caseId,
      taskId: body.taskId,
      title: body.title.trim(),
      type: body.type ?? "other",
      filePath: body.filePath.trim(),
      status: body.status ?? "draft",
      version: typeof body.version === "number" && body.version >= 1 ? Math.floor(body.version) : 1,
      createdAt: new Date().toISOString(),
    };
    project.store.deliverables.push(deliverable);
    writeStore(project.cwd, project.store);
    return NextResponse.json({ success: true, deliverable });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as DeliverableBody;
    const project = getProjectStore(body.cwd);
    if (!isProjectStore(project)) return project.response;
    if (!isNonEmptyString(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 });
    const index = project.store.deliverables.findIndex((d) => d.id === body.id);
    if (index < 0) return NextResponse.json({ error: "deliverable not found" }, { status: 404 });
    const next: Deliverable = { ...project.store.deliverables[index] };

    if (body.title !== undefined) {
      if (!isNonEmptyString(body.title)) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
      next.title = body.title.trim();
    }
    if (body.status !== undefined) {
      if (!validStatus(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
      next.status = body.status;
    }
    if (body.type !== undefined) {
      if (!validType(body.type)) return NextResponse.json({ error: "invalid type" }, { status: 400 });
      next.type = body.type;
    }
    if (body.version !== undefined) {
      if (typeof body.version !== "number" || body.version < 1) return NextResponse.json({ error: "invalid version" }, { status: 400 });
      next.version = Math.floor(body.version);
    }

    project.store.deliverables[index] = next;
    writeStore(project.cwd, project.store);
    return NextResponse.json({ success: true, deliverable: next });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const params = new URL(req.url).searchParams;
  const project = getProjectStore(params.get("cwd"));
  if (!isProjectStore(project)) return project.response;
  const id = params.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const index = project.store.deliverables.findIndex((d) => d.id === id);
  if (index < 0) return NextResponse.json({ error: "deliverable not found" }, { status: 404 });
  project.store.deliverables.splice(index, 1);
  writeStore(project.cwd, project.store);
  return NextResponse.json({ success: true });
}
