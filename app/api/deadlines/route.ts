import { NextResponse } from "next/server";
import { writeStore } from "@/lib/mju-store";
import type { Deadline, DeadlineStatus, DeadlineType } from "@/lib/mju-models";
import { findCase, getProjectStore, isNonEmptyString, isProjectStore, isValidDate } from "@/lib/mju-route-utils";
import { updateVaultItemStatus } from "@/lib/mju-vault-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** store DeadlineStatus → Vault 期限 frontmatter 中文「状态」值 */
const VAULT_DEADLINE_STATUS: Record<DeadlineStatus, string> = {
  proposed: "待确认",
  pending: "待处理",
  done: "已完成",
  missed: "已过期",
};
const deadlineStatuses = new Set<DeadlineStatus>(["proposed", "pending", "done", "missed"]);
const deadlineTypes = new Set<DeadlineType>(["court", "filing", "client", "internal"]);
type DeadlineBody = Partial<Deadline> & { cwd?: string };

function validType(value: unknown): value is DeadlineType {
  return typeof value === "string" && deadlineTypes.has(value as DeadlineType);
}

function validStatus(value: unknown): value is DeadlineStatus {
  return typeof value === "string" && deadlineStatuses.has(value as DeadlineStatus);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const project = getProjectStore(params.get("cwd"));
  if (!isProjectStore(project)) return project.response;
  const caseId = params.get("caseId");
  const status = params.get("status");
  if (status && !validStatus(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
  const deadlines = project.store.deadlines
    .filter((item) => !caseId || item.caseId === caseId)
    .filter((item) => !status || item.status === status)
    .sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json({ deadlines });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as DeadlineBody;
    const project = getProjectStore(body.cwd);
    if (!isProjectStore(project)) return project.response;
    if (!isNonEmptyString(body.caseId) || !findCase(project.store, body.caseId)) return NextResponse.json({ error: "valid caseId required" }, { status: 400 });
    if (!isNonEmptyString(body.title) || !isValidDate(body.date)) return NextResponse.json({ error: "title and valid date required" }, { status: 400 });
    if (body.type !== undefined && !validType(body.type)) return NextResponse.json({ error: "invalid type" }, { status: 400 });
    if (body.status !== undefined && !validStatus(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    const deadline: Deadline = { id: crypto.randomUUID(), caseId: body.caseId, title: body.title.trim(), date: body.date, type: body.type ?? "internal", status: body.status ?? "pending", createdAt: new Date().toISOString() };
    project.store.deadlines.push(deadline);
    writeStore(project.cwd, project.store);
    return NextResponse.json({ success: true, deadline });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as DeadlineBody;
    const project = getProjectStore(body.cwd);
    if (!isProjectStore(project)) return project.response;
    if (!isNonEmptyString(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 });
    const index = project.store.deadlines.findIndex((item) => item.id === body.id);
    if (index < 0) return NextResponse.json({ error: "deadline not found" }, { status: 404 });
    const next: Deadline = { ...project.store.deadlines[index] };
    if (body.caseId !== undefined) {
      if (!isNonEmptyString(body.caseId) || !findCase(project.store, body.caseId)) return NextResponse.json({ error: "valid caseId required" }, { status: 400 });
      next.caseId = body.caseId;
    }
    if (body.title !== undefined) {
      if (!isNonEmptyString(body.title)) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
      next.title = body.title.trim();
    }
    if (body.date !== undefined) {
      if (!isValidDate(body.date)) return NextResponse.json({ error: "invalid date" }, { status: 400 });
      next.date = body.date;
    }
    if (body.type !== undefined) {
      if (!validType(body.type)) return NextResponse.json({ error: "invalid type" }, { status: 400 });
      next.type = body.type;
    }
    if (body.status !== undefined) {
      if (!validStatus(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
      next.status = body.status;
    }
    project.store.deadlines[index] = next;
    writeStore(project.cwd, project.store);
    // Mirror status changes into the linked Vault 期限 file (if any).
    if (next.vaultPath && body.status !== undefined) {
      try {
        updateVaultItemStatus(project.cwd, next.vaultPath, "deadline", VAULT_DEADLINE_STATUS[next.status]);
      } catch {
        // Vault file may have been moved or deleted; the store remains the source of truth.
      }
      // Invalidate the vault-items cache so the Dates view sees the new status.
      if (globalThis.__mjuVaultItemsCache?.cwd === project.cwd) {
        globalThis.__mjuVaultItemsCache = undefined;
      }
    }
    return NextResponse.json({ success: true, deadline: next });
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
  const index = project.store.deadlines.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ error: "deadline not found" }, { status: 404 });
  project.store.deadlines.splice(index, 1);
  writeStore(project.cwd, project.store);
  return NextResponse.json({ success: true });
}
