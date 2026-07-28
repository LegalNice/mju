import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createEmptyStore, touchStore, type Case, type CaseType, type MjuStore } from "./mju-models";
import { ensureCaseSkeleton } from "./mju-guidance";
import { mjuProjectDir, mjuRootDir } from "./mju-paths";

const STORE_FILE = "store.json";

/** Primary location: outside the workspace so the vault stays a pure document archive. */
export function mjuDir(cwd: string): string {
  return mjuProjectDir(cwd);
}

/** Legacy in-workspace location, read-only fallback for stores created by early versions. */
function legacyStorePath(cwd: string): string {
  return join(cwd, ".mju", STORE_FILE);
}

export function storePath(cwd: string): string {
  return join(mjuDir(cwd), STORE_FILE);
}

export function hasMjuProject(cwd: string): boolean {
  return existsSync(storePath(cwd)) || existsSync(legacyStorePath(cwd));
}

export function ensureMjuDir(cwd: string): void {
  const dir = mjuDir(cwd);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readStore(cwd: string): MjuStore | null {
  // New location first; fall back to the legacy in-workspace store. The next
  // writeStore() persists to the new location, completing the migration.
  const path = existsSync(storePath(cwd)) ? storePath(cwd) : legacyStorePath(cwd);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isMjuStore(parsed)) {
      throw new Error("Invalid Mju store");
    }
    return normalizeStore(parsed);
  } catch {
    return null;
  }
}

export function writeStore(cwd: string, store: MjuStore): void {
  ensureMjuDir(cwd);
  const path = storePath(cwd);
  // Self-heal the absolute cwd into the store so /api/projects can list
  // projects without reverse-engineering the encoded directory name.
  if (store.cwd !== cwd) store.cwd = cwd;
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(touchStore(store), null, 2) + "\n", "utf8");
  renameSync(temporaryPath, path);
}

export const INBOX_CASE_TITLE = "通用任务";
export const INBOX_CASE_STAGE = "收件箱";

/**
 * Reverse-lookup a task by its bound pi session id across every initialized
 * project. Used to redirect legacy /sessions?session=<id> links to the owning
 * task page. Returns the project cwd and task, or null.
 */
export function findTaskBySessionId(sessionId: string): { cwd: string; taskId: string } | null {
  const projectsRoot = join(mjuRootDir(), "projects");
  if (!existsSync(projectsRoot)) return null;
  for (const entry of readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = readFileSync(join(projectsRoot, entry.name, STORE_FILE), "utf8");
      const store = JSON.parse(raw) as MjuStore;
      if (!store.cwd || !Array.isArray(store.tasks)) continue;
      const task = store.tasks.find((t) => t.sessionId === sessionId);
      if (task) return { cwd: store.cwd, taskId: task.id };
    } catch {
      // unreadable or malformed store — skip
    }
  }
  return null;
}

/**
 * Return the project's inbox case ("通用任务"), creating it — and its folder —
 * on first use. Tasks whose owning case could not be detected land here.
 */
export function ensureInboxCase(cwd: string, store: MjuStore): Case {
  const existing = store.cases.find(
    (c) => c.title === INBOX_CASE_TITLE && c.stage === INBOX_CASE_STAGE,
  );
  if (existing) return existing;
  const vaultPath = store.isObsidianVault ? join(cwd, "ops", "inbox") : join(cwd, "inbox");
  mkdirSync(vaultPath, { recursive: true });
  ensureCaseSkeleton(vaultPath, INBOX_CASE_TITLE, "advisory");
  const inbox: Case = {
    id: crypto.randomUUID(),
    title: INBOX_CASE_TITLE,
    type: "advisory",
    stage: INBOX_CASE_STAGE,
    status: "active",
    vaultPath,
    createdAt: new Date().toISOString(),
  };
  store.cases.push(inbox);
  writeStore(cwd, store);
  return inbox;
}

export function isMjuStore(value: unknown): value is MjuStore {
  if (!value || typeof value !== "object") return false;
  const store = value as Partial<MjuStore>;
  return store.version === 1
    && typeof store.projectName === "string"
    && typeof store.createdAt === "string"
    && typeof store.updatedAt === "string"
    && Array.isArray(store.clients)
    && Array.isArray(store.cases)
    && Array.isArray(store.tasks)
    && Array.isArray(store.deadlines)
    && Array.isArray(store.schedules)
    && Array.isArray(store.deliverables)
    && (store.workflowRuns === undefined || Array.isArray(store.workflowRuns));
}

function normalizeStore(store: MjuStore): MjuStore {
  return {
    ...store,
    workflowRuns: store.workflowRuns ?? [],
  };
}

export function initStore(cwd: string, projectName: string, projectType?: CaseType): MjuStore {
  const existing = readStore(cwd);
  if (existing) return existing;
  const store = createEmptyStore(projectName);
  if (projectType) store.projectType = projectType;
  writeStore(cwd, store);
  return store;
}
