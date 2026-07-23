import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

// Point the mju root at a temp dir before importing modules that write stores.
process.env.MJU_HOME = mkdtempSync(join(tmpdir(), "mju-home-"));

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { initStore, readStore } = await jiti.import("../../lib/mju-store.ts");
const casesRoute = await jiti.import("./cases/route.ts");
const tasksRoute = await jiti.import("./tasks/route.ts");
const deadlinesRoute = await jiti.import("./deadlines/route.ts");
const schedulesRoute = await jiti.import("./schedules/route.ts");
const workflowsRoute = await jiti.import("./workflows/route.ts");

function url(path, query = {}) {
  const params = new URLSearchParams(query);
  return `http://mju.test${path}${params.size ? `?${params}` : ""}`;
}

async function call(handler, path, { method = "GET", query, body } = {}) {
  const response = await handler(new Request(url(path, query), body === undefined ? { method } : {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
}

function makeProject(t) {
  const cwd = mkdtempSync(join(tmpdir(), "mju-api-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  initStore(cwd, "API test");
  return cwd;
}

async function createCase(cwd) {
  const result = await call(casesRoute.POST, "/api/cases", {
    method: "POST",
    body: { cwd, title: "测试案件", type: "litigation" },
  });
  assert.equal(result.status, 200);
  return result.body.case;
}

test("runs task CRUD with strict validation and persisted completion state", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);

  const invalid = await call(tasksRoute.POST, "/api/tasks", {
    method: "POST",
    body: { cwd, caseId: caseItem.id, title: "无效日期", assignee: "Justice", deadline: "2026-02-30" },
  });
  assert.equal(invalid.status, 400);

  const created = await call(tasksRoute.POST, "/api/tasks", {
    method: "POST",
    body: {
      cwd, caseId: caseItem.id, title: "整理证据目录", detail: "核对全部附件", assignee: "Justice",
      deadline: "2026-08-10", priority: "high", estimatedHours: 2, deliverableType: "evidence-list",
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.task.status, "待办");

  const listed = await call(tasksRoute.GET, "/api/tasks", { query: { cwd, caseId: caseItem.id, deadline: "2026-08-10" } });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.tasks.length, 1);

  const updated = await call(tasksRoute.PATCH, "/api/tasks", {
    method: "PATCH",
    body: { cwd, id: created.body.task.id, status: "完成", actualHours: 2.5, detail: "已核对并交付" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.task.status, "完成");
  assert.equal(updated.body.task.actualHours, 2.5);
  assert.ok(updated.body.task.completedAt);
  assert.equal(readStore(cwd)?.tasks[0].status, "完成");

  const deleted = await call(tasksRoute.DELETE, "/api/tasks", { method: "DELETE", query: { cwd, id: created.body.task.id } });
  assert.equal(deleted.status, 200);
  assert.equal((await call(tasksRoute.GET, "/api/tasks", { query: { cwd } })).body.tasks.length, 0);
});

test("runs deadline and schedule CRUD without accepting invalid calendar values", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);

  const badDeadline = await call(deadlinesRoute.POST, "/api/deadlines", {
    method: "POST", body: { cwd, caseId: caseItem.id, title: "无效期限", date: "2026-02-30" },
  });
  assert.equal(badDeadline.status, 400);

  const deadline = await call(deadlinesRoute.POST, "/api/deadlines", {
    method: "POST", body: { cwd, caseId: caseItem.id, title: "举证期限届满", date: "2026-08-11", type: "court" },
  });
  assert.equal(deadline.status, 200);
  assert.equal(deadline.body.deadline.status, "pending");

  const finished = await call(deadlinesRoute.PATCH, "/api/deadlines", {
    method: "PATCH", body: { cwd, id: deadline.body.deadline.id, status: "done" },
  });
  assert.equal(finished.status, 200);
  const done = await call(deadlinesRoute.GET, "/api/deadlines", { query: { cwd, status: "done" } });
  assert.equal(done.body.deadlines.length, 1);

  const badSchedule = await call(schedulesRoute.POST, "/api/schedules", {
    method: "POST", body: { cwd, caseId: caseItem.id, title: "无效开庭", datetime: "2026-02-30T09:00" },
  });
  assert.equal(badSchedule.status, 400);

  const schedule = await call(schedulesRoute.POST, "/api/schedules", {
    method: "POST", body: { cwd, caseId: caseItem.id, title: "第一次开庭", datetime: "2026-08-12T09:30", type: "court-hearing", location: "第一法庭" },
  });
  assert.equal(schedule.status, 200);
  const revisedSchedule = await call(schedulesRoute.PATCH, "/api/schedules", {
    method: "PATCH", body: { cwd, id: schedule.body.schedule.id, location: "第二法庭" },
  });
  assert.equal(revisedSchedule.body.schedule.location, "第二法庭");

  assert.equal((await call(deadlinesRoute.DELETE, "/api/deadlines", { method: "DELETE", query: { cwd, id: deadline.body.deadline.id } })).status, 200);
  assert.equal((await call(schedulesRoute.DELETE, "/api/schedules", { method: "DELETE", query: { cwd, id: schedule.body.schedule.id } })).status, 200);
});

test("previews and starts a case-compatible workflow exactly once", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);

  const list = await call(workflowsRoute.GET, "/api/workflows", { query: { cwd, caseId: caseItem.id } });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.workflows.map((workflow) => workflow.id), ["litigation-intake", "legal-research"]);
  assert.equal(list.body.workflows[0].started, false);

  const preview = await call(workflowsRoute.POST, "/api/workflows", {
    method: "POST", body: { cwd, caseId: caseItem.id, workflowId: "litigation-intake", action: "preview" },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.tasks.length, 5);
  assert.equal(readStore(cwd)?.tasks.length, 0);

  const started = await call(workflowsRoute.POST, "/api/workflows", {
    method: "POST", body: { cwd, caseId: caseItem.id, workflowId: "litigation-intake", action: "start" },
  });
  assert.equal(started.status, 201);
  assert.equal(started.body.tasks.length, 5);
  assert.equal(readStore(cwd)?.workflowRuns.length, 1);
  assert.ok(started.body.tasks.every((task) => task.workflowId === "litigation-intake"));

  const duplicate = await call(workflowsRoute.POST, "/api/workflows", {
    method: "POST", body: { cwd, caseId: caseItem.id, workflowId: "litigation-intake" },
  });
  assert.equal(duplicate.status, 409);

  const refreshed = await call(workflowsRoute.GET, "/api/workflows", { query: { cwd, caseId: caseItem.id } });
  assert.equal(refreshed.body.workflows[0].started, true);
});
