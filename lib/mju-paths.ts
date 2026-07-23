import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Mju keeps all of its own metadata outside the workspace (Obsidian vault or
 * plain project directory). The vault stays a pure document archive; tasks,
 * agent definitions and workflow state live under ~/.mju/.
 */

export function mjuRootDir(): string {
  // MJU_HOME overrides the root (tests, portable installs).
  return process.env.MJU_HOME ?? join(homedir(), ".mju");
}

/** Filesystem-safe, readable encoding of an absolute project path. */
export function encodeProjectId(cwd: string): string {
  return "-" + cwd.replaceAll("/", "-") + "-";
}

export function mjuProjectDir(cwd: string): string {
  return join(mjuRootDir(), "projects", encodeProjectId(cwd));
}

export function mjuProjectAgentsDir(cwd: string): string {
  return join(mjuProjectDir(cwd), "agents");
}
