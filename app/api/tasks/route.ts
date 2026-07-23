import { NextResponse } from "next/server";
import { writeStore } from "@/lib/mju-store";
import type { DeliverableType, Task, TaskPriority, TaskStatus } from "@/lib/mju-models";
import { findCase, getProjectStore, isNonEmptyString, isNonNegativeNumber, isOptionalString, isProjectStore, isValidDate } from "@/lib/mju-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const taskStatuses = new Set<TaskStatus>(["待办", "进行中", "完成", "取消"]);
const taskPriorities = new Set<TaskPriority>(["high", "medium", "low"]);
const deliverableTypes = new Set<DeliverableType>([
  "internal-opinion", "external-opinion", "docx-revision", "pleading", "evidence-list", "trial-outline", "research-report", "other",
]);

type TaskBody = Partial<Task> & { cwd?: string };

function validTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && taskStatuses.has(value as TaskStatus);
}

function validPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && taskPriorities.has(value as TaskPriority);
}

function validDeliverableType(value: unknown): value is DeliverableType {
  return typeof value === "string" && deliverableTypes.has(value as DeliverableType);
}

function byDeadline(a: Task, b: Task): number {
  if (!a.deadline) return b.deadline ? 1 : 0;
  if (!b.deadline) return -1;
  return a.deadline.localeCompare(b.deadline);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const project = getProjectStore(params.get("cwd"));
  if (!isProjectStore(project)) return project.response;

  const caseId = params.get("caseId");
  const status = params.get("status");
  const deadline = params.get("deadline");
  if (status && !validTaskStatus(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });

  const tasks = project.store.tasks
    .filter((task) => !caseId || task.caseId === caseId)
    .filter((task) => !status || task.status === status)
    .filter((task) => !deadline || task.deadline?.slice(0, 10) === deadline)
    .sort(byDeadline);
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as TaskBody;
    const project = getProjectStore(body.cwd);
    if (!isProjectStore(project)) return project.response;
    if (!isNonEmptyString(body.caseId) || !findCase(project.store, body.caseId)) {
      return NextResponse.json({ error: "valid caseId required" }, { status: 400 });
    }
    if (!isNonEmptyString(body.title) || !isNonEmptyString(body.assignee)) {
      return NextResponse.json({ error: "title and assignee required" }, { status: 400 });
    }
    if (body.status !== undefined && !validTaskStatus(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    if (body.priority !== undefined && !validPriority(body.priority)) return NextResponse.json({ error: "invalid priority" }, { status: 400 });
    if (body.deliverableType !== undefined && !validDeliverableType(body.deliverableType)) return NextResponse.json({ error: "invalid deliverableType" }, { status: 400 });
    if (body.deadline !== undefined && !isValidDate(body.deadline)) return NextResponse.json({ error: "invalid deadline" }, { status: 400 });
    if (body.estimatedHours !== undefined && !isNonNegativeNumber(body.estimatedHours)) return NextResponse.json({ error: "invalid estimatedHours" }, { status: 400 });
    if (body.actualHours !== undefined && !isNonNegativeNumber(body.actualHours)) return NextResponse.json({ error: "invalid actualHours" }, { status: 400 });
    if (!isOptionalString(body.detail) || !isOptionalString(body.deliverablePath)) return NextResponse.json({ error: "detail and deliverablePath must be strings" }, { status: 400 });
    if (!isOptionalString(body.sessionId) || !isOptionalString(body.originPrompt)) return NextResponse.json({ error: "sessionId and originPrompt must be strings" }, { status: 400 });
    if (body.relatedFiles !== undefined && (!Array.isArray(body.relatedFiles) || !body.relatedFiles.every(isNonEmptyString))) {
      return NextResponse.json({ error: "relatedFiles must be a string array" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const status = body.status ?? "待办";
    const task: Task = {
      id: crypto.randomUUID(),
      caseId: body.caseId,
      title: body.title.trim(),
      detail: body.detail?.trim() ?? "",
      assignee: body.assignee.trim(),
      status,
      priority: body.priority,
      deadline: body.deadline,
      estimatedHours: body.estimatedHours,
      actualHours: body.actualHours,
      deliverableType: body.deliverableType,
      deliverablePath: body.deliverablePath?.trim(),
      relatedFiles: body.relatedFiles?.map((path) => path.trim()),
      sessionId: body.sessionId?.trim() || undefined,
      originPrompt: body.originPrompt,
      createdAt: now,
      completedAt: status === "完成" ? now : undefined,
    };
    project.store.tasks.push(task);
    writeStore(project.cwd, project.store);
    return NextResponse.json({ success: true, task });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as TaskBody;
    const project = getProjectStore(body.cwd);
    if (!isProjectStore(project)) return project.response;
    if (!isNonEmptyString(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 });
    const index = project.store.tasks.findIndex((task) => task.id === body.id);
    if (index < 0) return NextResponse.json({ error: "task not found" }, { status: 404 });
    const current = project.store.tasks[index];
    const next: Task = { ...current };

    if (!isOptionalString(body.detail) || !isOptionalString(body.deliverablePath)) return NextResponse.json({ error: "detail and deliverablePath must be strings" }, { status: 400 });
    if (!isOptionalString(body.sessionId) || !isOptionalString(body.originPrompt)) return NextResponse.json({ error: "sessionId and originPrompt must be strings" }, { status: 400 });

    if (body.caseId !== undefined) {
      if (!isNonEmptyString(body.caseId) || !findCase(project.store, body.caseId)) return NextResponse.json({ error: "valid caseId required" }, { status: 400 });
      next.caseId = body.caseId;
    }
    if (body.title !== undefined) {
      if (!isNonEmptyString(body.title)) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
      next.title = body.title.trim();
    }
    if (body.detail !== undefined) next.detail = body.detail.trim();
    if (body.assignee !== undefined) {
      if (!isNonEmptyString(body.assignee)) return NextResponse.json({ error: "assignee cannot be empty" }, { status: 400 });
      next.assignee = body.assignee.trim();
    }
    if (body.status !== undefined) {
      if (!validTaskStatus(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
      next.status = body.status;
      next.completedAt = body.status === "完成" ? current.completedAt ?? new Date().toISOString() : undefined;
    }
    if (body.priority !== undefined) {
      if (!validPriority(body.priority)) return NextResponse.json({ error: "invalid priority" }, { status: 400 });
      next.priority = body.priority;
    }
    if (body.deadline !== undefined) {
      if (!isValidDate(body.deadline)) return NextResponse.json({ error: "invalid deadline" }, { status: 400 });
      next.deadline = body.deadline;
    }
    if (body.estimatedHours !== undefined) {
      if (!isNonNegativeNumber(body.estimatedHours)) return NextResponse.json({ error: "invalid estimatedHours" }, { status: 400 });
      next.estimatedHours = body.estimatedHours;
    }
    if (body.actualHours !== undefined) {
      if (!isNonNegativeNumber(body.actualHours)) return NextResponse.json({ error: "invalid actualHours" }, { status: 400 });
      next.actualHours = body.actualHours;
    }
    if (body.deliverableType !== undefined) {
      if (!validDeliverableType(body.deliverableType)) return NextResponse.json({ error: "invalid deliverableType" }, { status: 400 });
      next.deliverableType = body.deliverableType;
    }
    if (body.deliverablePath !== undefined) next.deliverablePath = body.deliverablePath.trim() || undefined;
    if (body.sessionId !== undefined) next.sessionId = body.sessionId.trim() || undefined;
    if (body.originPrompt !== undefined) next.originPrompt = body.originPrompt;
    if (body.relatedFiles !== undefined) {
      if (!Array.isArray(body.relatedFiles) || !body.relatedFiles.every(isNonEmptyString)) return NextResponse.json({ error: "relatedFiles must be a string array" }, { status: 400 });
      next.relatedFiles = body.relatedFiles.map((path) => path.trim());
    }

    project.store.tasks[index] = next;
    writeStore(project.cwd, project.store);
    return NextResponse.json({ success: true, task: next });
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
  const index = project.store.tasks.findIndex((task) => task.id === id);
  if (index < 0) return NextResponse.json({ error: "task not found" }, { status: 404 });
  project.store.tasks.splice(index, 1);
  writeStore(project.cwd, project.store);
  return NextResponse.json({ success: true });
}
