import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const mjuHome = mkdtempSync(join(tmpdir(), "mju-home-"));
process.env.MJU_HOME = mjuHome;

const jiti = createJiti(import.meta.url);
const {
  WORKFLOWS,
  buildWorkflowTasks,
  findWorkflow,
  listWorkflows,
  startWorkflow,
  workflowAlreadyStarted,
} = await jiti.import("./workflows.ts");
const { createEmptyStore } = await jiti.import("./mju-models.ts");
const { readMjuConfig, writeMjuConfig } = await jiti.import("./mju-config.ts");

function makeStore(type = "litigation") {
  const store = createEmptyStore("test");
  const caseItem = {
    id: "case-1",
    title: "Test Case",
    type,
    stage: "收案",
    status: "active",
    vaultPath: "/tmp/test-case",
    createdAt: new Date().toISOString(),
  };
  store.cases.push(caseItem);
  return { store, caseItem };
}

function cleanupConfigFiles() {
  for (const name of ["config.json", "workflows.json"]) {
    const path = join(mjuHome, name);
    if (existsSync(path)) rmSync(path);
  }
}

test("returns built-in workflows when no override exists", { concurrency: false }, (t) => {
  t.after(cleanupConfigFiles);
  cleanupConfigFiles();

  const workflows = listWorkflows();
  assert.equal(workflows.length, WORKFLOWS.length);
  assert.equal(findWorkflow("litigation-intake")?.name, "收案至庭前准备");
  assert.equal(findWorkflow("unknown"), undefined);
});

test("filters workflows by case type", { concurrency: false }, (t) => {
  t.after(cleanupConfigFiles);
  cleanupConfigFiles();

  assert.equal(listWorkflows("litigation").length, 2);
  assert.equal(listWorkflows("advisory").length, 2);
  assert.equal(listWorkflows("project").length, 2);
  assert.ok(listWorkflows("project").some((w) => w.id === "contract-review"));
  assert.ok(listWorkflows("project").some((w) => w.id === "legal-research"));
});

test("buildWorkflowTasks does not mutate store and assigns default agent names", { concurrency: false }, (t) => {
  t.after(cleanupConfigFiles);
  cleanupConfigFiles();

  const { caseItem } = makeStore("litigation");
  const workflow = findWorkflow("litigation-intake");
  const tasks = buildWorkflowTasks(caseItem, workflow);
  assert.equal(tasks.length, 5);
  assert.equal(tasks[0].assignee, "Chariot");
  assert.equal(tasks[1].assignee, "Justice");
  assert.equal(tasks.every((task) => task.caseId === caseItem.id), true);
});

test("startWorkflow persists tasks and run in the store", { concurrency: false }, (t) => {
  t.after(cleanupConfigFiles);
  cleanupConfigFiles();

  const { store, caseItem } = makeStore("litigation");
  const workflow = findWorkflow("litigation-intake");
  const { run, tasks } = startWorkflow(store, caseItem, workflow);

  assert.equal(store.tasks.length, 5);
  assert.equal(store.workflowRuns.length, 1);
  assert.equal(run.workflowId, workflow.id);
  assert.deepEqual(run.taskIds, tasks.map((task) => task.id));
  assert.equal(workflowAlreadyStarted(store, caseItem.id, workflow.id), true);
});

test("agent display names are read from ~/.mju/config.json", { concurrency: false }, async (t) => {
  t.after(cleanupConfigFiles);
  cleanupConfigFiles();

  writeMjuConfig({ agents: { justice: "Strategy", magician: "Writer", chariot: "Runner" } });
  assert.equal(readMjuConfig().agents?.justice, "Strategy");

  const { caseItem } = makeStore("advisory");
  const workflow = findWorkflow("contract-review");
  const tasks = buildWorkflowTasks(caseItem, workflow);
  assert.equal(tasks.find((task) => task.title.includes("内部审查意见"))?.assignee, "Strategy");
  assert.equal(tasks.find((task) => task.title.includes("修订稿"))?.assignee, "Writer");
});

test("valid ~/.mju/workflows.json overrides built-in workflows", { concurrency: false }, (t) => {
  t.after(cleanupConfigFiles);
  cleanupConfigFiles();

  const override = [
    {
      id: "custom-only",
      name: "自定义工作流",
      description: "仅用于测试",
      caseTypes: ["litigation"],
      tasks: [
        {
          title: "自定义任务",
          detail: "detail",
          assignee: "Justice",
          priority: "high",
          deliverableType: "other",
          deadlineOffsetDays: 1,
        },
      ],
    },
  ];
  writeFileSync(join(mjuHome, "workflows.json"), JSON.stringify(override), "utf8");

  const workflows = listWorkflows();
  assert.equal(workflows.length, 1);
  assert.equal(findWorkflow("custom-only")?.name, "自定义工作流");
  assert.equal(findWorkflow("litigation-intake"), undefined);
});

test("invalid ~/.mju/workflows.json falls back to built-in workflows", { concurrency: false }, (t) => {
  t.after(cleanupConfigFiles);
  cleanupConfigFiles();

  writeFileSync(join(mjuHome, "workflows.json"), "not-json", "utf8");
  const workflows = listWorkflows();
  assert.equal(workflows.length, WORKFLOWS.length);
  assert.equal(findWorkflow("litigation-intake")?.name, "收案至庭前准备");
});
