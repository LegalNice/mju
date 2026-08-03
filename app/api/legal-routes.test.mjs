import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

// Point the mju root at a temp dir before importing modules that write stores.
process.env.MJU_HOME = mkdtempSync(join(tmpdir(), "mju-home-"));

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { initStore, readStore, writeStore, findTaskBySessionId } = await jiti.import("../../lib/mju-store.ts");
const casesRoute = await jiti.import("./cases/route.ts");
const tasksRoute = await jiti.import("./tasks/route.ts");
const deadlinesRoute = await jiti.import("./deadlines/route.ts");
const schedulesRoute = await jiti.import("./schedules/route.ts");
const vaultItemsRoute = await jiti.import("./vault-items/route.ts");
const workflowsRoute = await jiti.import("./workflows/route.ts");
const projectsRoute = await jiti.import("./projects/route.ts");
const deliverablesRoute = await jiti.import("./deliverables/route.ts");
const mjuConfigRoute = await jiti.import("./mju-config/route.ts");

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

async function createCase(cwd, title = "测试案件") {
  const result = await call(casesRoute.POST, "/api/cases", {
    method: "POST",
    body: { cwd, title, type: "litigation" },
  });
  assert.equal(result.status, 200);
  return result.body.case;
}

test("creates litigation cases on the normalized default stage and tracks stage history", async (t) => {
  const cwd = makeProject(t);
  const created = await createCase(cwd);
  assert.equal(created.stage, "接案");
  assert.equal(created.stageIndex, 0);
  assert.deepEqual(created.stageHistory.map((entry) => entry.stage), ["接案"]);

  const clamped = await call(casesRoute.PATCH, "/api/cases", {
    method: "PATCH", body: { cwd, id: created.id, stageIndex: 99 },
  });
  assert.equal(clamped.status, 200);
  assert.equal(clamped.body.case.stageIndex, 7);
  assert.equal(clamped.body.case.stage, "结案");

  const next = await call(casesRoute.PATCH, "/api/cases", {
    method: "PATCH", body: { cwd, id: created.id, action: "next" },
  });
  assert.equal(next.status, 200);
  assert.equal(next.body.case.stageIndex, 7, "next clamps at the final stage");

  const previous = await call(casesRoute.PATCH, "/api/cases", {
    method: "PATCH", body: { cwd, id: created.id, action: "previous" },
  });
  assert.equal(previous.status, 200);
  assert.equal(previous.body.case.stageIndex, 6);

  const undo = await call(casesRoute.PATCH, "/api/cases", {
    method: "PATCH", body: { cwd, id: created.id, action: "undo" },
  });
  assert.equal(undo.status, 200);
  assert.equal(undo.body.case.stageIndex, 7);
  assert.deepEqual(undo.body.case.stageHistory.map((entry) => entry.stage), ["接案", "结案"]);

  const invalid = await call(casesRoute.PATCH, "/api/cases", {
    method: "PATCH", body: { cwd, id: created.id, stageIndex: "2" },
  });
  assert.equal(invalid.status, 400);
});

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

test("projects Vault tasks into Mju and writes Mju task updates back to the source document", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  const taskDir = join(caseItem.vaultPath, "任务");
  mkdirSync(taskDir, { recursive: true });
  const vaultTaskPath = join(taskDir, "核对证据清单.md");
  writeFileSync(vaultTaskPath, [
    "---",
    "事项类型: 任务",
    "状态: 待办",
    "截止日期: 2026-08-15",
    "描述: 对照原件核对证据编号",
    "---",
    "",
    "# 核对证据清单",
  ].join("\n"), "utf8");

  const listed = await call(tasksRoute.GET, "/api/tasks", { query: { cwd, caseId: caseItem.id } });
  assert.equal(listed.status, 200);
  const vaultTask = listed.body.tasks.find((task) => task.title === "核对证据清单");
  assert.ok(vaultTask, "hand-authored Vault task should appear in the shared task list");
  assert.equal(vaultTask.source, "vault");
  assert.equal(vaultTask.status, "待办");

  const patched = await call(tasksRoute.PATCH, "/api/tasks", {
    method: "PATCH",
    body: { cwd, id: vaultTask.id, status: "进行中", sessionId: "vault-session-1" },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.task.sessionId, "vault-session-1");
  const source = readFileSync(vaultTaskPath, "utf8");
  assert.match(source, /状态: 进行中/);
  assert.match(source, /mju任务ID:/);
  assert.equal(readStore(cwd)?.tasks[0].sessionId, "vault-session-1");

  const otherCase = await createCase(cwd, "转移案件");
  const reassigned = await call(tasksRoute.PATCH, "/api/tasks", {
    method: "PATCH",
    body: { cwd, id: vaultTask.id, caseId: otherCase.id },
  });
  assert.equal(reassigned.status, 200);
  assert.ok(reassigned.body.task.vaultPath.startsWith(`${otherCase.vaultPath}/任务/`));
  assert.equal(existsSync(vaultTaskPath), false, "reassignment should move the canonical task file");

  const created = await call(tasksRoute.POST, "/api/tasks", {
    method: "POST",
    body: { cwd, caseId: caseItem.id, title: "Mju 新建任务", assignee: "auto", deadline: "2026-08-18" },
  });
  assert.equal(created.status, 200);
  assert.ok(created.body.task.vaultPath);
  assert.ok(existsSync(created.body.task.vaultPath), "Mju task should be materialized in the case task folder");
  assert.match(readFileSync(created.body.task.vaultPath, "utf8"), /事项类型: 任务/);
});

test("migrates a legacy store-only task into its canonical Vault task document on first read", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  const store = readStore(cwd);
  assert.ok(store);
  store.tasks.push({
    id: "legacy-task-1",
    caseId: caseItem.id,
    title: "历史任务",
    detail: "旧版 store 中的任务",
    assignee: "auto",
    status: "进行中",
    createdAt: "2026-07-29T00:00:00.000Z",
  });
  writeStore(cwd, store);

  const listed = await call(tasksRoute.GET, "/api/tasks", { query: { cwd } });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.tasks[0].source, "vault");
  const migrated = readStore(cwd)?.tasks.find((task) => task.id === "legacy-task-1");
  assert.ok(migrated?.vaultPath && existsSync(migrated.vaultPath));
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

test("edits Vault-native deadline and schedule times without changing their Markdown bodies", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  const deadlineDir = join(caseItem.vaultPath, "期限");
  const scheduleDir = join(caseItem.vaultPath, "日程");
  mkdirSync(deadlineDir, { recursive: true });
  mkdirSync(scheduleDir, { recursive: true });
  const deadlinePath = join(deadlineDir, "答辩期限.md");
  const schedulePath = join(scheduleDir, "开庭.md");
  writeFileSync(deadlinePath, "---\n事项类型: 期限\n截止日期: 2026-08-11\n---\n\n保留的期限说明\n", "utf8");
  writeFileSync(schedulePath, "---\n事项类型: 日程\n开始时间: 2026-08-12 09:30\n---\n\n保留的日程说明\n", "utf8");

  const listed = await call(vaultItemsRoute.GET, "/api/vault-items", { query: { cwd } });
  const deadline = listed.body.items.find((item) => item.title === "答辩期限");
  const schedule = listed.body.items.find((item) => item.title === "开庭");
  assert.ok(deadline);
  assert.ok(schedule);

  const patchedDeadline = await call(vaultItemsRoute.PATCH, "/api/vault-items", {
    method: "PATCH", body: { cwd, filePath: deadline.filePath, kind: "deadline", date: "2026-08-15" },
  });
  assert.equal(patchedDeadline.status, 200);
  const patchedSchedule = await call(vaultItemsRoute.PATCH, "/api/vault-items", {
    method: "PATCH", body: { cwd, filePath: schedule.filePath, kind: "schedule", date: "2026-08-16", time: "14:00" },
  });
  assert.equal(patchedSchedule.status, 200);
  assert.match(readFileSync(deadlinePath, "utf8"), /截止日期: ['"]?2026-08-15['"]?[\s\S]*保留的期限说明/);
  assert.match(readFileSync(schedulePath, "utf8"), /开始时间: ['"]?2026-08-16 14:00['"]?[\s\S]*保留的日程说明/);

  const invalid = await call(vaultItemsRoute.PATCH, "/api/vault-items", {
    method: "PATCH", body: { cwd, filePath: schedule.filePath, kind: "schedule", date: "2026-08-16", time: "9:00" },
  });
  assert.equal(invalid.status, 400);
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

test("moves pending tasks to in progress when an agent session is bound", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);

  const created = await call(tasksRoute.POST, "/api/tasks", {
    method: "POST",
    body: {
      cwd, caseId: caseItem.id, title: "判例检索", assignee: "auto",
      sessionId: "sess-123", originPrompt: "帮我检索相关判例",
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.task.sessionId, "sess-123");
  assert.equal(created.body.task.status, "进行中");
  assert.equal(created.body.task.originPrompt, "帮我检索相关判例");
  assert.equal(readStore(cwd)?.tasks[0].sessionId, "sess-123");

  const rebound = await call(tasksRoute.PATCH, "/api/tasks", {
    method: "PATCH",
    body: { cwd, id: created.body.task.id, sessionId: "sess-456" },
  });
  assert.equal(rebound.status, 200);
  assert.equal(rebound.body.task.sessionId, "sess-456");
  assert.equal(rebound.body.task.originPrompt, "帮我检索相关判例");

  const pending = await call(tasksRoute.POST, "/api/tasks", {
    method: "POST",
    body: { cwd, caseId: caseItem.id, title: "开具律师费发票", assignee: "auto" },
  });
  assert.equal(pending.body.task.status, "待办");

  const started = await call(tasksRoute.PATCH, "/api/tasks", {
    method: "PATCH",
    body: { cwd, id: pending.body.task.id, sessionId: "sess-awaiting-client" },
  });
  assert.equal(started.status, 200);
  assert.equal(started.body.task.status, "进行中");
  assert.match(readFileSync(started.body.task.vaultPath, "utf8"), /状态: 进行中/);

  const invalid = await call(tasksRoute.POST, "/api/tasks", {
    method: "POST",
    body: { cwd, caseId: caseItem.id, title: "坏类型", assignee: "auto", sessionId: 42 },
  });
  assert.equal(invalid.status, 400);
});

test("reverse-looks up a task by bound session id across projects", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);
  const created = await call(tasksRoute.POST, "/api/tasks", {
    method: "POST",
    body: { cwd, caseId: caseItem.id, title: "反查任务", assignee: "auto", sessionId: "sess-lookup-1" },
  });
  assert.equal(created.status, 200);

  const found = findTaskBySessionId("sess-lookup-1");
  assert.deepEqual(found, { cwd, taskId: created.body.task.id });
  assert.equal(findTaskBySessionId("sess-nonexistent"), null);
});

test("creates the inbox case exactly once via ensure_inbox", async (t) => {
  const cwd = makeProject(t);

  const first = await call(casesRoute.POST, "/api/cases", { method: "POST", body: { cwd, action: "ensure_inbox" } });
  assert.equal(first.status, 200);
  assert.equal(first.body.case.title, "通用任务");
  assert.equal(first.body.case.stage, "收件箱");

  const second = await call(casesRoute.POST, "/api/cases", { method: "POST", body: { cwd, action: "ensure_inbox" } });
  assert.equal(second.status, 200);
  assert.equal(second.body.case.id, first.body.case.id);
  assert.equal(readStore(cwd)?.cases.length, 1);
});

test("lists initialized projects with decoded cwd", async (t) => {
  const cwd = makeProject(t);
  await createCase(cwd);

  const listed = await call(projectsRoute.GET, "/api/projects");
  assert.equal(listed.status, 200);
  const found = listed.body.projects.find((project) => project.cwd === cwd);
  assert.ok(found, "project should be discoverable by its real cwd");
  assert.equal(found.name, "API test");
  assert.equal(found.caseCount, 1);
});

test("runs deliverable CRUD with validation", async (t) => {
  const cwd = makeProject(t);
  const caseItem = await createCase(cwd);

  const created = await call(deliverablesRoute.POST, "/api/deliverables", {
    method: "POST",
    body: { cwd, caseId: caseItem.id, title: "法律意见书", filePath: "/tmp/out.docx", type: "external-opinion" },
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.deliverable.status, "draft");
  assert.equal(created.body.deliverable.version, 1);

  const badStatus = await call(deliverablesRoute.PATCH, "/api/deliverables", {
    method: "PATCH", body: { cwd, id: created.body.deliverable.id, status: "weird" },
  });
  assert.equal(badStatus.status, 400);

  const updated = await call(deliverablesRoute.PATCH, "/api/deliverables", {
    method: "PATCH", body: { cwd, id: created.body.deliverable.id, status: "final", version: 2 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.deliverable.status, "final");
  assert.equal(updated.body.deliverable.version, 2);

  const listed = await call(deliverablesRoute.GET, "/api/deliverables", { query: { cwd, caseId: caseItem.id } });
  assert.equal(listed.body.deliverables.length, 1);

  const deleted = await call(deliverablesRoute.DELETE, "/api/deliverables", { method: "DELETE", query: { cwd, id: created.body.deliverable.id } });
  assert.equal(deleted.status, 200);
  assert.equal(readStore(cwd)?.deliverables.length, 0);
});

test("reads and writes the classify model in the global mju config", async () => {
  const initial = await call(mjuConfigRoute.GET, "/api/mju-config");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.classifyModel, null);

  const invalid = await call(mjuConfigRoute.PUT, "/api/mju-config", {
    method: "PUT", body: { classifyModel: "no-slash" },
  });
  assert.equal(invalid.status, 400);

  const set = await call(mjuConfigRoute.PUT, "/api/mju-config", {
    method: "PUT", body: { classifyModel: "deepseek/deepseek-chat" },
  });
  assert.equal(set.status, 200);
  assert.equal(set.body.success, true);
  assert.equal((await call(mjuConfigRoute.GET, "/api/mju-config")).body.classifyModel, "deepseek/deepseek-chat");

  const reset = await call(mjuConfigRoute.PUT, "/api/mju-config", {
    method: "PUT", body: { classifyModel: null },
  });
  assert.equal(reset.status, 200);
  assert.equal((await call(mjuConfigRoute.GET, "/api/mju-config")).body.classifyModel, null);
});

test("reads and writes MinerU config in the global mju config", async () => {
  await call(mjuConfigRoute.PUT, "/api/mju-config", {
    method: "PUT", body: { mineru: null },
  });
  const initial = await call(mjuConfigRoute.GET, "/api/mju-config");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.mineru, null);

  const invalid = await call(mjuConfigRoute.PUT, "/api/mju-config", {
    method: "PUT", body: { mineru: { apiToken: 123 } },
  });
  assert.equal(invalid.status, 400);

  const set = await call(mjuConfigRoute.PUT, "/api/mju-config", {
    method: "PUT", body: {
      mineru: {
        apiToken: "sk-test",
        modelVersion: "vlm",
        enableOcr: true,
        enableTable: true,
        enableFormula: false,
      },
    },
  });
  assert.equal(set.status, 200);
  const got = (await call(mjuConfigRoute.GET, "/api/mju-config")).body.mineru;
  assert.equal(got.apiToken, "sk-test");
  assert.equal(got.modelVersion, "vlm");
  assert.equal(got.enableOcr, true);
  assert.equal(got.enableFormula, false);

  await call(mjuConfigRoute.PUT, "/api/mju-config", {
    method: "PUT", body: { mineru: null },
  });
});
