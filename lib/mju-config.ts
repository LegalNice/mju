import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mjuRootDir } from "./mju-paths";

/**
 * Global mju configuration, stored at <mjuRootDir()>/config.json.
 * Separate from project stores — applies across all projects.
 */
export interface MjuAgentNames {
  /** Display name for the analytical/strategic agent (default: Justice). */
  justice?: string;
  /** Display name for the drafting/polishing agent (default: Magician). */
  magician?: string;
  /** Display name for the research/execution agent (default: Chariot). */
  chariot?: string;
}

export interface MjuConfig {
  /** "provider/id" model ref used for entry-page case classification. */
  classifyModel?: string;
  /** Custom display names for the three default legal agents. */
  agents?: MjuAgentNames;
}

function configPath(): string {
  return join(mjuRootDir(), "config.json");
}

function isValidAgentNames(value: unknown): value is MjuAgentNames {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const names = value as Record<string, unknown>;
  for (const key of ["justice", "magician", "chariot"]) {
    const v = names[key];
    if (v !== undefined && typeof v !== "string") return false;
  }
  return true;
}

/** Parse a "provider/id" model ref; returns null for malformed values. */
export function parseModelRef(ref: string): { provider: string; id: string } | null {
  const [provider, ...rest] = ref.split("/");
  const id = rest.join("/");
  return provider && id ? { provider, id } : null;
}

/** Missing file → {}; unparseable content → {} (never throws). */
export function readMjuConfig(): MjuConfig {
  try {
    if (!existsSync(configPath())) return {};
    const parsed = JSON.parse(readFileSync(configPath(), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const config = parsed as Record<string, unknown>;
    const result: MjuConfig = {};
    if (typeof config.classifyModel === "string") result.classifyModel = config.classifyModel;
    if (isValidAgentNames(config.agents)) result.agents = config.agents;
    return result;
  } catch {
    return {};
  }
}

/** Merge a patch into the stored config; undefined values delete the key. */
export function writeMjuConfig(patch: Partial<MjuConfig>): MjuConfig {
  const next: Record<string, unknown> = { ...readMjuConfig() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  mkdirSync(mjuRootDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(next, null, 2) + "\n", "utf8");
  return next as MjuConfig;
}
