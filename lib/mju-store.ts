import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createEmptyStore, touchStore, type MjuStore } from "./mju-models";

const MJU_DIR = ".mju";
const STORE_FILE = "store.json";

export function mjuDir(cwd: string): string {
  return join(cwd, MJU_DIR);
}

export function storePath(cwd: string): string {
  return join(mjuDir(cwd), STORE_FILE);
}

export function hasMjuProject(cwd: string): boolean {
  return existsSync(storePath(cwd));
}

export function ensureMjuDir(cwd: string): void {
  const dir = mjuDir(cwd);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readStore(cwd: string): MjuStore | null {
  const path = storePath(cwd);
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
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(touchStore(store), null, 2) + "\n", "utf8");
  renameSync(temporaryPath, path);
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

export function initStore(cwd: string, projectName: string, projectType?: "advisory" | "litigation"): MjuStore {
  const existing = readStore(cwd);
  if (existing) return existing;
  const store = createEmptyStore(projectName);
  if (projectType) store.projectType = projectType;
  writeStore(cwd, store);
  return store;
}
