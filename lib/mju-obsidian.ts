import { existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import type { Case, CaseType, CaseStatus } from "./mju-models";
import { hasCanonicalStructure } from "./mju-guidance";

export interface ObsidianCaseCandidate {
  title: string;
  vaultPath: string;
  type: CaseType;
  status: CaseStatus;
  stage: string;
}

const OBSIDIAN_CONFIG_DIR = ".obsidian";
const CASE_BASE_DIRS: Array<{ path: string; type: CaseType }> = [
  { path: join("ops", "cases", "案卷"), type: "litigation" },
  { path: join("ops", "projects", "活跃项目"), type: "advisory" },
  { path: join("ops", "projects", "休眠项目"), type: "advisory" },
  { path: join("ops", "cases", "休眠案卷"), type: "litigation" },
];

export function isObsidianVault(cwd: string): boolean {
  return existsSync(join(cwd, OBSIDIAN_CONFIG_DIR));
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function inferStatus(basePath: string): CaseStatus {
  if (basePath.includes("归档")) return "closed";
  if (basePath.includes("休眠")) return "dormant";
  return "active";
}

function inferStage(vaultPath: string): string {
  const name = basename(vaultPath);
  if (name.includes("收案")) return "收案";
  if (name.includes("材料")) return "材料整理";
  if (name.includes("起草") || name.includes("文书")) return "文书起草";
  if (name.includes("庭前")) return "庭前准备";
  if (name.includes("开庭")) return "开庭";
  if (name.includes("结案") || name.includes("归档")) return "结案";
  return "收案";
}

export function scanObsidianCases(vaultPath: string): ObsidianCaseCandidate[] {
  // Scan whenever the canonical ops/ layout exists — Obsidian vault or not.
  if (!isObsidianVault(vaultPath) && !hasCanonicalStructure(vaultPath)) return [];
  const results: ObsidianCaseCandidate[] = [];

  for (const base of CASE_BASE_DIRS) {
    const dir = join(vaultPath, base.path);
    if (!isDirectory(dir)) continue;

    let entries: string[];
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name);
    } catch {
      continue;
    }

    for (const name of entries) {
      const casePath = join(dir, name);
      results.push({
        title: name,
        vaultPath: casePath,
        type: base.type,
        status: inferStatus(base.path),
        stage: inferStage(casePath),
      });
    }
  }

  return results;
}

export function findCaseByVaultPath(vaultPath: string, cases: Case[]): Case | undefined {
  return cases.find((c) => c.vaultPath === vaultPath);
}
