import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { load as parseYaml } from "js-yaml";
import type { Case, MjuStore } from "./mju-models";

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
    });
  }
  return items;
}
