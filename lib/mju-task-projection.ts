import { existsSync, mkdirSync, renameSync } from "node:fs";
import { basename, join } from "node:path";
import type { Case, MjuStore, Task } from "./mju-models";
import { createVaultTask, scanVaultTasks, type VaultTask, writeVaultTask } from "./mju-vault-items";

/**
 * Task read model shared by Board, Dates, homepage and task detail.
 *
 * Vault Markdown owns title/status/deadline/detail. The Mju store contributes
 * only execution metadata (session, workflow and deliverables) and is also the
 * backwards-compatible lookup index for old sessions.
 */

function coreFromVault(vaultTask: VaultTask, stored?: Task): Task {
  return {
    ...(stored ?? {}),
    id: vaultTask.id,
    caseId: vaultTask.caseId || stored?.caseId || "",
    title: vaultTask.title,
    detail: vaultTask.detail,
    assignee: vaultTask.assignee,
    status: vaultTask.status,
    priority: vaultTask.priority,
    deadline: vaultTask.deadline,
    createdAt: vaultTask.createdAt,
    completedAt: vaultTask.completedAt,
    vaultPath: vaultTask.vaultPath,
    source: "vault",
  };
}

function storeFallback(task: Task): Task {
  return { ...task, source: "store" };
}

/**
 * One-time, idempotent migration of legacy store-only tasks. The Markdown file
 * is created before the store is saved, so a partial failure never leaves a
 * stored `vaultPath` pointing at a file that does not exist.
 */
export function ensureVaultTasks(store: MjuStore): boolean {
  let changed = false;
  for (const task of store.tasks) {
    if (task.vaultPath && existsSync(task.vaultPath)) continue;
    const caseItem = store.cases.find((item) => item.id === task.caseId);
    if (!caseItem) continue;
    task.vaultPath = createVaultTask(caseItem, task);
    changed = true;
  }
  return changed;
}

export function getUnifiedTasks(cwd: string, store: MjuStore): Task[] {
  const vaultTasks = scanVaultTasks(cwd, store);
  const storedById = new Map(store.tasks.map((task) => [task.id, task]));
  const storedByPath = new Map(
    store.tasks
      .filter((task): task is Task & { vaultPath: string } => Boolean(task.vaultPath))
      .map((task) => [task.vaultPath, task]),
  );
  const seenStoreIds = new Set<string>();
  const unified = vaultTasks.map((vaultTask) => {
    const stored = storedById.get(vaultTask.id) ?? storedByPath.get(vaultTask.vaultPath);
    if (stored) seenStoreIds.add(stored.id);
    return coreFromVault(vaultTask, stored);
  });

  // Keep a visible fallback only for malformed/missing Vault files. A user
  // should not lose an execution record merely because an external sync is
  // temporarily incomplete.
  for (const task of store.tasks) {
    if (!seenStoreIds.has(task.id) && (!task.vaultPath || !existsSync(task.vaultPath))) {
      unified.push(storeFallback(task));
    }
  }
  return unified;
}

/** Persist an updated task to its canonical Vault document. */
export function persistTaskToVault(store: MjuStore, task: Task): Task {
  const caseItem = store.cases.find((item) => item.id === task.caseId);
  if (!caseItem) throw new Error("Task case not found");
  const destinationDir = join(caseItem.vaultPath, "任务");
  let vaultPath = task.vaultPath && existsSync(task.vaultPath)
    ? task.vaultPath
    : createVaultTask(caseItem, task);
  // Reassigning a task changes its case in both views and on disk. Keep the
  // original Markdown body by moving the source file before rewriting fields.
  if (!vaultPath.startsWith(`${destinationDir}/`)) {
    mkdirSync(destinationDir, { recursive: true });
    let destination = join(destinationDir, basename(vaultPath));
    if (existsSync(destination)) destination = join(destinationDir, `${task.id}.md`);
    renameSync(vaultPath, destination);
    vaultPath = destination;
  }
  const next = { ...task, vaultPath, source: undefined };
  writeVaultTask(next, vaultPath);
  return next;
}

/** Convert a Vault-only task into a store execution metadata record on demand. */
export function createExecutionRecord(task: Task): Task {
  const record = { ...task };
  delete record.source;
  return record;
}

export function caseForTask(store: MjuStore, task: Task): Case | undefined {
  return store.cases.find((item) => item.id === task.caseId);
}
