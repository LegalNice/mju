import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mjuRootDir } from "./mju-paths";

/**
 * Global mju configuration, stored at <mjuRootDir()>/config.json.
 * Separate from project stores — applies across all projects.
 */
export interface MjuConfig {
  /** "provider/id" model ref used for entry-page case classification. */
  classifyModel?: string;
}

function configPath(): string {
  return join(mjuRootDir(), "config.json");
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
    return typeof config.classifyModel === "string" ? { classifyModel: config.classifyModel } : {};
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
