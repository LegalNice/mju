import { NextResponse } from "next/server";
import { writeStore } from "@/lib/mju-store";
import type { Schedule, ScheduleType } from "@/lib/mju-models";
import { findCase, getProjectStore, isNonEmptyString, isOptionalString, isProjectStore, isValidDateTime } from "@/lib/mju-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scheduleTypes = new Set<ScheduleType>(["court-hearing", "client-meeting", "internal-meeting", "other"]);
type ScheduleBody = Partial<Schedule> & { cwd?: string };

function validType(value: unknown): value is ScheduleType {
  return typeof value === "string" && scheduleTypes.has(value as ScheduleType);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const project = getProjectStore(params.get("cwd"));
  if (!isProjectStore(project)) return project.response;
  const caseId = params.get("caseId");
  const schedules = project.store.schedules
    .filter((item) => !caseId || item.caseId === caseId)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  return NextResponse.json({ schedules });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as ScheduleBody;
    const project = getProjectStore(body.cwd);
    if (!isProjectStore(project)) return project.response;
    if (!isNonEmptyString(body.caseId) || !findCase(project.store, body.caseId)) return NextResponse.json({ error: "valid caseId required" }, { status: 400 });
    if (!isNonEmptyString(body.title) || !isValidDateTime(body.datetime)) return NextResponse.json({ error: "title and valid datetime required" }, { status: 400 });
    if (body.type !== undefined && !validType(body.type)) return NextResponse.json({ error: "invalid type" }, { status: 400 });
    if (!isOptionalString(body.location)) return NextResponse.json({ error: "location must be a string" }, { status: 400 });
    const schedule: Schedule = { id: crypto.randomUUID(), caseId: body.caseId, title: body.title.trim(), datetime: body.datetime, location: body.location?.trim() || undefined, type: body.type ?? "other", createdAt: new Date().toISOString() };
    project.store.schedules.push(schedule);
    writeStore(project.cwd, project.store);
    return NextResponse.json({ success: true, schedule });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as ScheduleBody;
    const project = getProjectStore(body.cwd);
    if (!isProjectStore(project)) return project.response;
    if (!isNonEmptyString(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 });
    const index = project.store.schedules.findIndex((item) => item.id === body.id);
    if (index < 0) return NextResponse.json({ error: "schedule not found" }, { status: 404 });
    const next: Schedule = { ...project.store.schedules[index] };
    if (body.caseId !== undefined) {
      if (!isNonEmptyString(body.caseId) || !findCase(project.store, body.caseId)) return NextResponse.json({ error: "valid caseId required" }, { status: 400 });
      next.caseId = body.caseId;
    }
    if (body.title !== undefined) {
      if (!isNonEmptyString(body.title)) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
      next.title = body.title.trim();
    }
    if (body.datetime !== undefined) {
      if (!isValidDateTime(body.datetime)) return NextResponse.json({ error: "invalid datetime" }, { status: 400 });
      next.datetime = body.datetime;
    }
    if (!isOptionalString(body.location)) return NextResponse.json({ error: "location must be a string" }, { status: 400 });
    if (body.location !== undefined) next.location = body.location.trim() || undefined;
    if (body.type !== undefined) {
      if (!validType(body.type)) return NextResponse.json({ error: "invalid type" }, { status: 400 });
      next.type = body.type;
    }
    project.store.schedules[index] = next;
    writeStore(project.cwd, project.store);
    return NextResponse.json({ success: true, schedule: next });
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
  const index = project.store.schedules.findIndex((item) => item.id === id);
  if (index < 0) return NextResponse.json({ error: "schedule not found" }, { status: 404 });
  project.store.schedules.splice(index, 1);
  writeStore(project.cwd, project.store);
  return NextResponse.json({ success: true });
}
