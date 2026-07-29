import { NextResponse } from "next/server";
import { writeStore } from "@/lib/mju-store";
import { findCase, getProjectStore, isNonEmptyString, isProjectStore } from "@/lib/mju-route-utils";
import { buildWorkflowTasks, findWorkflow, listWorkflows, startWorkflow, workflowAlreadyStarted } from "@/lib/workflows";
import type { MjuStore } from "@/lib/mju-models";
import { persistTaskToVault } from "@/lib/mju-task-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WorkflowBody = { cwd?: string; caseId?: string; workflowId?: string; action?: "preview" | "start" };

function resolveWorkflow(project: { cwd: string; store: MjuStore }, caseId: unknown, workflowId: unknown) {
  if (!isNonEmptyString(caseId) || !isNonEmptyString(workflowId)) return { error: NextResponse.json({ error: "caseId and workflowId required" }, { status: 400 }) };
  const caseItem = findCase(project.store, caseId);
  if (!caseItem) return { error: NextResponse.json({ error: "case not found" }, { status: 404 }) };
  const workflow = findWorkflow(workflowId);
  if (!workflow) return { error: NextResponse.json({ error: "workflow not found" }, { status: 404 }) };
  if (!workflow.caseTypes.includes(caseItem.type)) return { error: NextResponse.json({ error: "workflow does not apply to this case type" }, { status: 400 }) };
  return { caseItem, workflow };
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const project = getProjectStore(params.get("cwd"));
  if (!isProjectStore(project)) return project.response;
  const caseId = params.get("caseId");
  const caseItem = caseId ? findCase(project.store, caseId) : undefined;
  if (caseId && !caseItem) return NextResponse.json({ error: "case not found" }, { status: 404 });
  const workflows = listWorkflows(caseItem?.type).map((workflow) => ({
    ...workflow,
    started: caseItem ? workflowAlreadyStarted(project.store, caseItem.id, workflow.id) : false,
  }));
  return NextResponse.json({ workflows });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as WorkflowBody;
    const project = getProjectStore(body.cwd);
    if (!isProjectStore(project)) return project.response;
    const resolved = resolveWorkflow(project, body.caseId, body.workflowId);
    if ("error" in resolved) return resolved.error;
    const { caseItem, workflow } = resolved;

    if (body.action === "preview") {
      return NextResponse.json({ workflow, tasks: buildWorkflowTasks(caseItem, workflow) });
    }
    if (body.action !== undefined && body.action !== "start") return NextResponse.json({ error: "invalid action" }, { status: 400 });
    if (workflowAlreadyStarted(project.store, caseItem.id, workflow.id)) {
      return NextResponse.json({ error: "workflow already started for this case" }, { status: 409 });
    }
    const { run, tasks } = startWorkflow(project.store, caseItem, workflow);
    const persistedTasks = tasks.map((task) => {
      const persisted = persistTaskToVault(project.store, task);
      const index = project.store.tasks.findIndex((item) => item.id === task.id);
      if (index >= 0) project.store.tasks[index] = persisted;
      return { ...persisted, source: "vault" as const };
    });
    writeStore(project.cwd, project.store);
    return NextResponse.json({ success: true, run, tasks: persistedTasks }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
