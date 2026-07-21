import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    const parsed = JSON.parse(raw) as MjuStore;
    if (parsed.version !== 1) {
      throw new Error(`Unsupported store version: ${parsed.version}`);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStore(cwd: string, store: MjuStore): void {
  ensureMjuDir(cwd);
  writeFileSync(storePath(cwd), JSON.stringify(touchStore(store), null, 2) + "\n", "utf8");
}

export function initStore(cwd: string, projectName: string, projectType?: "advisory" | "litigation"): MjuStore {
  const existing = readStore(cwd);
  if (existing) return existing;
  const store = createEmptyStore(projectName);
  if (projectType) store.projectType = projectType;
  writeStore(cwd, store);
  return store;
}
