import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { writeStore } from "@/lib/mju-store";
import {
  classifyMaterials,
  inferDeadlines,
} from "@/lib/material-intelligence";
import type { Case, Deadline, MjuStore, Task } from "@/lib/mju-models";

export interface MaterialAnalysisResult {
  classifications: ReturnType<typeof classifyMaterials>;
  moved: Array<{ from: string; to: string }>;
  chroniclePath: string;
  createdDeadlines: Array<{ deadline: Deadline; filePath: string }>;
  reviewTask: { task: Task; filePath: string };
}

function uniqueFileName(dir: string, baseName: string, ext: string): string {
  let candidate = join(dir, `${baseName}${ext}`);
  if (!existsSync(candidate)) return candidate;
  let n = 2;
  while (existsSync(candidate)) {
    candidate = join(dir, `${baseName}-${n}${ext}`);
    n++;
  }
  return candidate;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowString(): string {
  return new Date().toISOString();
}

function createDeadlineFile(caseDir: string, title: string, date: string): string {
  const dir = join(caseDir, "期限");
  mkdirSync(dir, { recursive: true });
  const path = uniqueFileName(dir, `${date}_${title.replace(/\s+/g, "_")}`, ".md");
  writeFileSync(
    path,
    `---
事项类型: 期限
状态: 待办
截止日期: ${date}
描述: |
  ${title}
---

## 事项

${title}

## 处理记录

`,
    "utf8",
  );
  return path;
}

function createTaskFile(caseDir: string, title: string, detail: string): string {
  const dir = join(caseDir, "任务");
  mkdirSync(dir, { recursive: true });
  const date = todayString();
  const path = uniqueFileName(dir, `${date}_${title.replace(/\s+/g, "_")}`, ".md");
  writeFileSync(
    path,
    `---
事项类型: 任务
状态: 待办
分类: 整理
截止日期: 待确认
描述: |
  ${title}
备注: |
  ${detail}
---

## 背景

${detail}

## 工作内容

## 产出

## 检索与复用
`,
    "utf8",
  );
  return path;
}

function createChronicleEntry(caseDir: string, date: string, lines: string[]): string {
  const dir = join(caseDir, "大事记");
  mkdirSync(dir, { recursive: true });
  const title = "收到材料";
  const path = uniqueFileName(dir, `${date}_${title}`, ".md");
  writeFileSync(
    path,
    `---
事项类型: 大事记
日期: ${date}
描述: |
  收到 ${lines.length} 份材料
---

## 材料清单

${lines.map((line) => `- ${line}`).join("\n")}
`,
    "utf8",
  );
  return path;
}

function listMaterialFiles(caseDir: string): string[] {
  const dir = join(caseDir, "材料");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => join(dir, entry.name));
}

/**
 * Classify everything currently in the case's 材料/ folder, auto-move
 * high-confidence files, record a chronicle entry, infer deadlines, and
 * always create a review task. Returns null when there is nothing to analyze.
 */
export function analyzeCaseMaterials(
  project: { cwd: string; store: MjuStore },
  caseItem: Case,
): MaterialAnalysisResult | null {
  const materialFiles = listMaterialFiles(caseItem.vaultPath);
  if (materialFiles.length === 0) {
    return null;
  }

  const classifications = classifyMaterials(materialFiles);
  const moved: Array<{ from: string; to: string }> = [];

  // Only auto-move high-confidence suggestions away from 材料/.
  for (const item of classifications) {
    if (item.confidence !== "high" || item.suggestedFolder === "材料") continue;
    const source = join(caseItem.vaultPath, "材料", item.fileName);
    if (!existsSync(source)) continue;
    const targetDir = join(caseItem.vaultPath, item.suggestedFolder);
    mkdirSync(targetDir, { recursive: true });
    const target = join(targetDir, item.fileName);
    if (existsSync(target)) continue; // do not overwrite
    renameSync(source, target);
    moved.push({ from: source, to: target });
  }

  // Create a chronicle entry for the received batch.
  const date = todayString();
  const chronicleLines = classifications.map(
    (c) => `${c.fileName}（${c.label}${moved.some((m) => basename(m.from) === c.fileName) ? "，已自动归位" : ""}）`,
  );
  const chroniclePath = createChronicleEntry(caseItem.vaultPath, date, chronicleLines);

  // Infer deadlines and persist them both as files and in the store.
  const inferredDeadlines = inferDeadlines(classifications);
  const createdDeadlines: Array<{ deadline: Deadline; filePath: string }> = [];
  for (const inferred of inferredDeadlines) {
    const id = crypto.randomUUID();
    const deadline: Deadline = {
      id,
      caseId: caseItem.id,
      title: inferred.title,
      date: inferred.date,
      type: inferred.type,
      status: "pending",
      createdAt: nowString(),
    };
    const filePath = createDeadlineFile(caseItem.vaultPath, inferred.title, inferred.date);
    project.store.deadlines.push(deadline);
    createdDeadlines.push({ deadline, filePath });
  }

  // Always create a review task when new materials arrive.
  const reviewTask: Task = {
    id: crypto.randomUUID(),
    caseId: caseItem.id,
    title: "审阅并分类新到材料",
    detail: `本次收到 ${classifications.length} 份材料，请核对自动分类结果并补充关键信息。`,
    assignee: "Justice",
    status: "待办",
    priority: "medium",
    createdAt: nowString(),
  };
  const reviewTaskPath = createTaskFile(
    caseItem.vaultPath,
    reviewTask.title,
    reviewTask.detail,
  );
  project.store.tasks.push(reviewTask);

  writeStore(project.cwd, project.store);

  return {
    classifications,
    moved,
    chroniclePath,
    createdDeadlines,
    reviewTask: { task: reviewTask, filePath: reviewTaskPath },
  };
}
