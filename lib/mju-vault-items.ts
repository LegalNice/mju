import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { dump as dumpYaml, load as parseYaml } from "js-yaml";
import type { Case, MjuStore, Task, TaskPriority, TaskStatus } from "./mju-models";

/**
 * Vault-native dated items. The user's Obsidian convention (documented by the
 * vault's own .base files): one markdown file per item under 任务/ / 期限/ /
 * 日程/ folders, with Chinese frontmatter (事项类型 / 状态 / 截止日期 /
 * 开始时间). Mju reads these into the Dates view — no checkbox or emoji
 * parsing; frontmatter is authoritative.
 */

export interface VaultItem {
  kind: "task" | "deadline" | "schedule";
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm (schedules with a start time) */
  time?: string;
  title: string;
  caseId?: string;
  filePath: string;
  source: "vault";
  /** Vault-native 状态字符串（如「待确认」「待处理」「完成」）。任务/期限条目有。 */
  status?: string;
}

/**
 * A Vault task normalized into Mju's task shape. It deliberately carries the
 * source file path: that file, not the Mju store, owns the business fields.
 */
export interface VaultTask extends Task {
  source: "vault";
  vaultPath: string;
}

const ITEM_DIRS = new Map<string, VaultItem["kind"]>([
  ["任务", "task"],
  ["期限", "deadline"],
  ["日程", "schedule"],
]);

const DONE_STATUSES = new Set(["完成", "已完成", "取消", "已取消"]);
const SKIP_DIRS = new Set([".obsidian", ".git", ".trash", "node_modules", "templates"]);
const MAX_FILES = 500;
const MAX_DEPTH = 8;

function toDateString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // js-yaml parses bare YYYY-MM-DD as a UTC Date
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const match = /(\d{4}-\d{2}-\d{2})/.exec(value);
    if (match) return match[1];
  }
  return null;
}

function toTimeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /(\d{1,2}:\d{2})/.exec(value);
  return match ? match[1] : undefined;
}

function cleanTitle(filename: string): string {
  return basename(filename, ".md")
    .replace(/^\d{4}-\d{2}-\d{2}[_-]\s*/, "")
    .replace(/[_-]\d{4}-\d{2}-\d{2}$/, "")
    .trim();
}

function taskIdForPath(filePath: string): string {
  return `vault-${createHash("sha256").update(filePath).digest("hex").slice(0, 24)}`;
}

function taskStatus(value: unknown): TaskStatus {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized === "进行中" || normalized === "处理中") return "进行中";
  if (normalized === "完成" || normalized === "已完成") return "完成";
  if (normalized === "取消" || normalized === "已取消") return "取消";
  return "待办";
}

function taskPriority(value: unknown): TaskPriority | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "high" || normalized === "高") return "high";
  if (normalized === "medium" || normalized === "中") return "medium";
  if (normalized === "low" || normalized === "低") return "low";
  return undefined;
}

function taskText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function frontmatterOf(filePath: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return null;
  try {
    const parsed = parseYaml(raw.slice(3, end));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function rawWithFrontmatter(filePath: string): { frontmatter: Record<string, unknown>; body: string } | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return null;
  try {
    const parsed = parseYaml(raw.slice(3, end));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return { frontmatter: parsed as Record<string, unknown>, body: raw.slice(end + 4).replace(/^\n+/, "") };
  } catch {
    return null;
  }
}

function collectItemFiles(dir: string, depth: number, out: string[]): void {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      // Item folders hold the files themselves — no deeper walk needed inside them
      if (ITEM_DIRS.has(entry.name)) {
        try {
          for (const f of readdirSync(full)) {
            if (out.length >= MAX_FILES) return;
            if (f.endsWith(".md") && !f.startsWith(".")) out.push(join(full, f));
          }
        } catch { /* unreadable item dir */ }
      } else {
        collectItemFiles(full, depth + 1, out);
      }
    }
  }
}

function caseForPath(store: MjuStore, filePath: string): Case | undefined {
  // Longest-prefix match so nested advisory folders win over the vault root.
  return store.cases
    .filter((c) => filePath.startsWith(c.vaultPath + "/"))
    .sort((a, b) => b.vaultPath.length - a.vaultPath.length)[0];
}

/** Scan every Vault task, including undated and completed tasks for Board/detail. */
export function scanVaultTasks(cwd: string, store: MjuStore): VaultTask[] {
  const opsDir = join(cwd, "ops");
  if (!existsSync(opsDir)) return [];
  const files: string[] = [];
  collectItemFiles(opsDir, 0, files);

  const tasks: VaultTask[] = [];
  for (const vaultPath of files) {
    if (basename(join(vaultPath, "..")) !== "任务") continue;
    const fm = frontmatterOf(vaultPath);
    if (!fm) continue;
    const typeRaw = typeof fm["事项类型"] === "string" ? fm["事项类型"] : "任务";
    if (typeRaw !== "任务") continue;
    const modifiedAt = (() => {
      try { return statSync(vaultPath).mtime.toISOString(); } catch { return new Date(0).toISOString(); }
    })();
    const deadline = toDateString(fm["截止日期"]) ?? toDateString(fm["开始时间"]) ?? undefined;
    const completedAt = taskStatus(fm["状态"]) === "完成"
      ? toDateString(fm["完成时间"]) ?? toDateString(fm["结束时间"]) ?? undefined
      : undefined;
    tasks.push({
      id: taskText(fm["mju任务ID"]) ?? taskIdForPath(vaultPath),
      caseId: caseForPath(store, vaultPath)?.id ?? "",
      title: cleanTitle(vaultPath),
      detail: taskText(fm["描述"]) ?? "",
      assignee: taskText(fm["负责人"]) ?? taskText(fm["执行人"]) ?? "律师",
      status: taskStatus(fm["状态"]),
      priority: taskPriority(fm["优先级"]),
      deadline,
      createdAt: toDateString(fm["创建时间"]) ?? toDateString(fm["开始时间"]) ?? modifiedAt,
      completedAt,
      source: "vault",
      vaultPath,
    });
  }
  return tasks;
}

function safeFilePart(value: string): string {
  const normalized = value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
  return normalized || "任务";
}

function atomicWrite(filePath: string, content: string): void {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, content, "utf8");
  renameSync(temporaryPath, filePath);
}

function taskFrontmatter(task: Task): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    "事项类型": "任务",
    "状态": task.status,
    "负责人": task.assignee,
    "mju任务ID": task.id,
    "创建时间": task.createdAt,
  };
  if (task.priority) frontmatter["优先级"] = task.priority;
  if (task.deadline) frontmatter["截止日期"] = task.deadline;
  if (task.detail) frontmatter["描述"] = task.detail;
  if (task.completedAt) frontmatter["完成时间"] = task.completedAt;
  return frontmatter;
}

/** Create a new canonical Vault task document for a Mju-originated task. */
export function createVaultTask(caseItem: Case, task: Task): string {
  const dir = join(caseItem.vaultPath, "任务");
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${safeFilePart(task.title)}-${task.id.slice(0, 8)}.md`);
  const content = `---\n${dumpYaml(taskFrontmatter(task), { lineWidth: -1 })}---\n\n# ${task.title}\n${task.detail ? `\n${task.detail}\n` : ""}`;
  atomicWrite(filePath, content);
  return filePath;
}

/** Update only Mju-owned task frontmatter fields while retaining the Markdown body. */
export function writeVaultTask(task: Task, vaultPath: string): void {
  const existing = rawWithFrontmatter(vaultPath);
  if (!existing) throw new Error("Vault task file is missing or has invalid frontmatter");
  const frontmatter = { ...existing.frontmatter, ...taskFrontmatter(task) };
  if (!task.priority) delete frontmatter["优先级"];
  if (!task.deadline) delete frontmatter["截止日期"];
  if (!task.detail) delete frontmatter["描述"];
  if (!task.completedAt) delete frontmatter["完成时间"];
  const content = `---\n${dumpYaml(frontmatter, { lineWidth: -1 })}---\n\n${existing.body}`;
  atomicWrite(vaultPath, content);
}

/**
 * Update the date fields of a Vault-native deadline or schedule while retaining
 * every other frontmatter field and the Markdown body. The file must live
 * under the selected project's ops/ directory; this keeps the API from being
 * used as a general file writer.
 */
export function updateVaultItemDate(
  cwd: string,
  filePath: string,
  kind: "deadline" | "schedule",
  date: string,
  time?: string,
): void {
  const opsRoot = resolve(cwd, "ops");
  const target = resolve(filePath);
  if (!target.startsWith(`${opsRoot}/`)) throw new Error("Vault item is outside the project ops directory");

  const existing = rawWithFrontmatter(target);
  if (!existing) throw new Error("Vault item file is missing or has invalid frontmatter");
  const folderKind = ITEM_DIRS.get(basename(join(target, "..")));
  const typeRaw = existing.frontmatter["事项类型"];
  const itemKind = typeRaw === "期限" ? "deadline" : typeRaw === "日程" ? "schedule" : folderKind;
  if (itemKind !== kind) throw new Error("Vault item type does not match");

  const frontmatter = { ...existing.frontmatter };
  if (kind === "deadline") {
    frontmatter["截止日期"] = date;
  } else {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) throw new Error("Schedule time is required");
    frontmatter["开始时间"] = `${date} ${time}`;
  }
  const content = `---\n${dumpYaml(frontmatter, { lineWidth: -1 })}---\n\n${existing.body}`;
  atomicWrite(target, content);
}

/**
 * Update the 状态 frontmatter field of a Vault-native deadline while retaining
 * every other field and the Markdown body. Used by the proposed→pending
 * confirmation flow. The file must live under the project's ops/ directory.
 */
export function updateVaultItemStatus(
  cwd: string,
  filePath: string,
  kind: "deadline",
  status: string,
): void {
  const opsRoot = resolve(cwd, "ops");
  const target = resolve(filePath);
  if (!target.startsWith(`${opsRoot}/`)) throw new Error("Vault item is outside the project ops directory");

  const existing = rawWithFrontmatter(target);
  if (!existing) throw new Error("Vault item file is missing or has invalid frontmatter");
  const folderKind = ITEM_DIRS.get(basename(join(target, "..")));
  const typeRaw = existing.frontmatter["事项类型"];
  const itemKind = typeRaw === "期限" ? "deadline" : typeRaw === "日程" ? "schedule" : folderKind;
  if (itemKind !== kind) throw new Error("Vault item type does not match");

  const frontmatter = { ...existing.frontmatter, "状态": status };
  const content = `---\n${dumpYaml(frontmatter, { lineWidth: -1 })}---\n\n${existing.body}`;
  atomicWrite(target, content);
}

/** Scan ops/** for 任务/期限/日程 item files and normalize their frontmatter. */
export function scanVaultItems(cwd: string, store: MjuStore): VaultItem[] {
  const opsDir = join(cwd, "ops");
  if (!existsSync(opsDir)) return [];
  const files: string[] = [];
  collectItemFiles(opsDir, 0, files);

  const items: VaultItem[] = [];
  for (const filePath of files) {
    const folderKind = ITEM_DIRS.get(basename(join(filePath, ".."))) ?? null;
    const fm = frontmatterOf(filePath);
    if (!fm) continue;
    const typeRaw = typeof fm["事项类型"] === "string" ? fm["事项类型"] : null;
    const kind = (typeRaw === "任务" || typeRaw === "期限" || typeRaw === "日程") ? typeRaw === "期限" ? "deadline" : typeRaw === "日程" ? "schedule" : "task" : folderKind;
    if (!kind) continue;
    const status = typeof fm["状态"] === "string" ? fm["状态"].trim() : "";
    if (DONE_STATUSES.has(status)) continue;

    const date = kind === "schedule" ? toDateString(fm["开始时间"]) : toDateString(fm["截止日期"]) ?? toDateString(fm["开始时间"]);
    if (!date) continue;
    const time = kind === "schedule" ? toTimeString(fm["开始时间"]) : undefined;

    items.push({
      kind,
      date,
      time,
      title: cleanTitle(filePath),
      caseId: caseForPath(store, filePath)?.id,
      filePath,
      source: "vault",
      status: status || undefined,
    });
  }
  return items;
}
