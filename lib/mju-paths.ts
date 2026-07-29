import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

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
  // Keep the existing POSIX encoding stable so metadata written by earlier
  // versions remains addressable. Windows path characters need their own
  // encoding because `:` is not legal in a Windows directory name and `\\`
  // would otherwise be interpreted as a path separator.
  const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(cwd) || cwd.startsWith("\\\\");
  if (!isWindowsPath) {
    const normalized = cwd.replace(/\/+$/, "");
    return "-" + normalized.replaceAll("/", "-") + "-";
  }

  // Normalize separator style and trailing separators so C:/work and
  // C:\\work resolve to one project id. The readable part avoids every
  // Windows-reserved filename character; the hash preserves uniqueness after
  // normalization and makes the final segment safe on all supported systems.
  const normalized = cwd.replaceAll("\\", "/").replace(/\/+$/, "");
  const readable = normalized.replace(/[\\/:*?"<>|]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  const fingerprint = createHash("sha256").update(normalized.toLowerCase()).digest("hex").slice(0, 10);
  return `-${readable}-${fingerprint}-`;
}

export function mjuProjectDir(cwd: string): string {
  return join(mjuRootDir(), "projects", encodeProjectId(cwd));
}

export function mjuProjectAgentsDir(cwd: string): string {
  return join(mjuProjectDir(cwd), "agents");
}
