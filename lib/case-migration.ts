// 既有案卷整理：扫描项目根目录下尚未纳入标准结构的"案件样"文件夹，
// 经用户确认后移动进 ops/ 标准结构、补齐案件骨架、登记进 store，
// 并顺带从文件名推断期限/日程、写大事记导入记录、创建核对任务。
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  DEFAULT_LITIGATION_STAGES,
  litigationStageIndexFor,
  normalizeStageIndex,
  type Case,
  type CaseStatus,
  type CaseType,
  type Deadline,
  type MjuStore,
  type Schedule,
  type Task,
} from "./mju-models";
import { ensureCaseSkeleton } from "./mju-guidance";
import { classifyMaterial, classifyMaterials, extractDates, inferDeadlines } from "./material-intelligence";
import { createDeadlineFile, createTaskFile, uniqueFileName } from "./material-analysis";
import { writeStore } from "./mju-store";

export interface LegacyCaseCandidate {
  /** 待迁移文件夹的绝对路径。 */
  sourcePath: string;
  /** 草案案件名（默认文件夹名，可被 AI 精修或用户编辑）。 */
  title: string;
  type: CaseType;
  status: CaseStatus;
  /** 诉讼案件的当前阶段标签（默认八阶段之一）。 */
  stage: string;
  stageIndex?: number;
  parties?: { plaintiff?: string; defendant?: string; other?: string[] };
  court?: string;
  caseNumber?: string;
  /** 文件夹内文件总数（统计有上限，仅作规模参考）。 */
  fileCount: number;
  /** 前若干个文件名，供 AI 精修与界面预览。 */
  sampleFiles: string[];
  /** 命中原因，界面展示用。 */
  signals: string[];
}

export interface LooseFile {
  path: string;
  name: string;
}

export interface LegacyScanResult {
  candidates: LegacyCaseCandidate[];
  /** 根目录下不属于任何案件的散落文件。 */
  looseFiles: LooseFile[];
}

export interface MigrationDecision {
  sourcePath: string;
  accept: boolean;
  title: string;
  type: CaseType;
  status: CaseStatus;
  stageIndex?: number;
  parties?: { plaintiff?: string; defendant?: string; other?: string[] };
  court?: string;
  caseNumber?: string;
  /** 指派给该案件的散落文件绝对路径（移入其 材料/）。 */
  looseFiles?: string[];
}

export interface MigrationItemResult {
  sourcePath: string;
  ok: boolean;
  caseId?: string;
  title?: string;
  targetPath?: string;
  classifiedFiles?: number;
  deadlines?: number;
  schedules?: number;
  error?: string;
}

export interface MigrationApplyResult {
  items: MigrationItemResult[];
  casesCreated: number;
  deadlinesCreated: number;
  schedulesCreated: number;
  reviewTasksCreated: number;
}

/** 永不进入扫描的顶层目录。 */
const EXCLUDED_DIRS = new Set([
  "ops",
  "templates",
  "node_modules",
  "inbox",
]);

/** 根目录下永不当作散落文件的名称。 */
const EXCLUDED_LOOSE_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
]);

const NAME_CASE_KEYWORDS = ["诉", "vs", "纠纷", "仲裁", "执行", "案"];
const NAME_ADVISORY_KEYWORDS = ["顾问", "专项", "常年", "尽调", "合规"];
const LEGAL_FILE_KEYWORDS = [
  "起诉状", "答辩状", "上诉状", "判决书", "裁定书", "调解书", "传票",
  "证据", "合同", "协议", "委托", "代理词", "律师函", "仲裁",
];
const STAGE_KEYWORDS = ["立案", "举证", "证据交换", "庭前", "开庭", "判决", "裁判", "执行", "结案", "归档"];
const SCHEDULE_FILE_KEYWORDS = ["开庭", "听证", "庭前会议"];
const CASE_NUMBER_RE = /[（(]\d{4}[）)][\u4e00-\u9fa5A-Za-z0-9]{0,20}?\d+号/;
const COURT_RE = /[\u4e00-\u9fa5]{2,30}法院/;
const PARTY_SPLIT_RE = /^(.+?)\s*(?:诉|v\.?s\.?)\s*(.+)$/i;
/** 当事人名后常见的案由词尾，剥离后得到干净的当事人名。 */
const CAUSE_SUFFIX_RE = /(?:(?:买卖|民间|借贷|借款|租赁|劳动|合同|侵权|离婚|继承|欠款|工程款|股权|房屋|交通|建设工程|建设|名誉|保证|追偿|金融|票据|保险|担保|抵押|物业|婚姻|抚养|赡养|析产|损害|赔偿|责任|纠纷|争议|案件|案)+)$/;

const MAX_SCAN_FILES = 300;
const MAX_SAMPLE_FILES = 30;

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

function listTopLevel(cwd: string): { dirs: string[]; files: string[] } {
  const dirs: string[] = [];
  const files: string[] = [];
  let entries;
  try {
    entries = readdirSync(cwd, { withFileTypes: true });
  } catch {
    return { dirs, files };
  }
  for (const entry of entries) {
    if (isHidden(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) dirs.push(entry.name);
    else if (entry.isFile()) files.push(entry.name);
  }
  return { dirs, files };
}

/** 浅层遍历（最深 2 级）收集文件名与计数，供启发式与 AI 精修使用。 */
function collectFiles(dir: string): { fileCount: number; names: string[] } {
  let fileCount = 0;
  const names: string[] = [];
  const walk = (current: string, depth: number) => {
    if (fileCount >= MAX_SCAN_FILES) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (fileCount >= MAX_SCAN_FILES) return;
      if (isHidden(entry.name) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (depth < 2) walk(join(current, entry.name), depth + 1);
      } else if (entry.isFile()) {
        fileCount += 1;
        if (names.length < MAX_SAMPLE_FILES) names.push(entry.name);
      }
    }
  };
  walk(dir, 0);
  return { fileCount, names };
}

function inferType(name: string): CaseType {
  return NAME_ADVISORY_KEYWORDS.some((kw) => name.includes(kw)) ? "advisory" : "litigation";
}

function inferStatus(name: string): CaseStatus {
  if (/归档|已结|结案/.test(name)) return "closed";
  if (/休眠|暂停/.test(name)) return "dormant";
  return "active";
}

function inferStageIndex(name: string, sampleFiles: string[]): number {
  const haystack = [name, ...sampleFiles].join(" ");
  let best = 0;
  for (const keyword of STAGE_KEYWORDS) {
    if (!haystack.includes(keyword)) continue;
    const index = litigationStageIndexFor(keyword);
    if (index !== undefined && index > best) best = index;
  }
  return best;
}

export function parseParties(name: string): { plaintiff?: string; defendant?: string } | undefined {
  const cleaned = name.replace(CASE_NUMBER_RE, "").replace(COURT_RE, "");
  const match = PARTY_SPLIT_RE.exec(cleaned);
  if (!match) return undefined;
  const strip = (value: string) => value.replace(/[（(].*$/, "").replace(CAUSE_SUFFIX_RE, "").trim();
  const plaintiff = strip(match[1]);
  const defendant = strip(match[2]);
  if (!plaintiff || !defendant) return undefined;
  return { plaintiff, defendant };
}

function extractCaseNumber(text: string): string | undefined {
  return CASE_NUMBER_RE.exec(text)?.[0];
}

function extractCourt(text: string): string | undefined {
  return COURT_RE.exec(text)?.[0];
}

/**
 * 规则预扫描：找出项目根目录下疑似案件的文件夹与散落文件。
 * 已登记进 store 的 vaultPath、标准 ops/ 结构、隐藏目录与符号链接一律跳过。
 */
export function scanLegacyCases(cwd: string, store: MjuStore): LegacyScanResult {
  const registered = new Set(store.cases.map((c) => c.vaultPath));
  const { dirs, files } = listTopLevel(cwd);
  const candidates: LegacyCaseCandidate[] = [];

  for (const name of dirs) {
    if (EXCLUDED_DIRS.has(name)) continue;
    const sourcePath = join(cwd, name);
    if (registered.has(sourcePath)) continue;

    const { fileCount, names } = collectFiles(sourcePath);
    const lower = name.toLowerCase();
    const signals: string[] = [];
    if (NAME_CASE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) signals.push("目录名命中案件关键词");
    if (NAME_ADVISORY_KEYWORDS.some((kw) => name.includes(kw))) signals.push("目录名命中顾问/专项关键词");
    const legalHits = names.filter((file) =>
      LEGAL_FILE_KEYWORDS.some((kw) => file.includes(kw)),
    ).length;
    if (legalHits >= 2) signals.push(`内含 ${legalHits} 份法律文件`);
    if (signals.length === 0) continue;

    const type = inferType(name);
    const status = inferStatus(name);
    const stageIndex = inferStageIndex(name, names);
    const parties = type === "litigation" ? parseParties(name) : undefined;
    const textCorpus = [name, ...names].join(" ");
    candidates.push({
      sourcePath,
      title: name,
      type,
      status,
      stage: DEFAULT_LITIGATION_STAGES[stageIndex],
      stageIndex: type === "litigation" ? stageIndex : undefined,
      parties,
      court: extractCourt(textCorpus),
      caseNumber: extractCaseNumber(textCorpus),
      fileCount,
      sampleFiles: names,
      signals,
    });
  }

  const looseFiles: LooseFile[] = files
    .filter((name) => !EXCLUDED_LOOSE_FILES.has(name))
    .map((name) => ({ path: join(cwd, name), name }));

  return { candidates, looseFiles };
}

function caseBaseDir(cwd: string, type: CaseType, status: CaseStatus): string {
  const bucket = status === "closed" ? "归档" : status === "dormant" ? "休眠" : "";
  return type === "litigation"
    ? join(cwd, "ops", "cases", `${bucket}案卷`)
    : join(cwd, "ops", "projects", `${bucket || "活跃"}项目`);
}

function uniqueTargetDir(baseDir: string, title: string): string {
  const safe = title.replace(/[\\/]+/g, "_").trim() || "未命名案件";
  const candidate = join(baseDir, safe);
  if (!existsSync(candidate)) return candidate;
  let n = 2;
  while (existsSync(join(baseDir, `${safe}-${n}`))) n++;
  return join(baseDir, `${safe}-${n}`);
}

/** 移动文件夹；跨设备时退化为复制+删除（同 vault 内通常是同卷 rename）。 */
function moveDirectory(source: string, target: string): void {
  try {
    renameSync(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    cpSync(source, target, { recursive: true });
    rmSync(source, { recursive: true, force: true });
  }
}

function createScheduleFile(caseDir: string, title: string, date: string): string {
  const dir = join(caseDir, "日程");
  mkdirSync(dir, { recursive: true });
  const path = uniqueFileName(dir, `${date}_${title.replace(/\s+/g, "_")}`, ".md");
  writeFileSync(
    path,
    `---
事项类型: 日程
状态: 待办
开始时间: ${date} 09:00
描述: |
  ${title}（由既有案卷导入按文件名推断，时间待确认）
---

## 事项

${title}
`,
    "utf8",
  );
  return path;
}

function createImportChronicle(caseDir: string, date: string, lines: string[]): string {
  const dir = join(caseDir, "大事记");
  mkdirSync(dir, { recursive: true });
  const path = uniqueFileName(dir, `${date}_导入既有案卷`, ".md");
  writeFileSync(
    path,
    `---
事项类型: 大事记
日期: ${date}
描述: |
  既有案卷经整理向导导入 Mju 标准结构
---

## 导入说明

案件文件夹由原位置移入标准结构，内部散文件按文件名规则归类，请人工核对。

## 文件清单

${lines.map((line) => `- ${line}`).join("\n")}
`,
    "utf8",
  );
  return path;
}

function moveLooseFilesInto(caseDir: string, looseFiles: string[], chronicleLines: string[]): number {
  if (looseFiles.length === 0) return 0;
  const dir = join(caseDir, "材料");
  mkdirSync(dir, { recursive: true });
  let moved = 0;
  for (const source of looseFiles) {
    if (!existsSync(source)) continue;
    const name = basename(source);
    const dot = name.lastIndexOf(".");
    const target = uniqueFileName(dir, dot > 0 ? name.slice(0, dot) : name, dot > 0 ? name.slice(dot) : "");
    renameSync(source, target);
    chronicleLines.push(`${name}（根目录散落文件，已移入 材料/）`);
    moved += 1;
  }
  return moved;
}

/**
 * 执行用户确认后的整理方案。逐案 try/catch，单案失败不影响其余；
 * store 统一在最后落盘一次。
 */
export function applyCaseMigration(
  cwd: string,
  store: MjuStore,
  decisions: MigrationDecision[],
): MigrationApplyResult {
  const result: MigrationApplyResult = {
    items: [],
    casesCreated: 0,
    deadlinesCreated: 0,
    schedulesCreated: 0,
    reviewTasksCreated: 0,
  };
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  let storeChanged = false;

  for (const decision of decisions) {
    const item: MigrationItemResult = { sourcePath: decision.sourcePath, ok: false };
    result.items.push(item);
    if (!decision.accept) {
      item.error = "skipped";
      continue;
    }
    try {
      if (!existsSync(decision.sourcePath)) throw new Error("源文件夹不存在");
      const title = decision.title.trim();
      if (!title) throw new Error("案件名不能为空");

      const baseDir = caseBaseDir(cwd, decision.type, decision.status);
      mkdirSync(baseDir, { recursive: true });
      const target = uniqueTargetDir(baseDir, title);
      moveDirectory(decision.sourcePath, target);
      ensureCaseSkeleton(target, title, decision.type);

      // 归类案件根目录下的散文件（不含刚生成的主文件与子目录）。
      const masterName = `${title.replace(/[\\/]+/g, "_")}.md`;
      const rootFiles = readdirSync(target, { withFileTypes: true })
        .filter((entry) => entry.isFile() && !isHidden(entry.name) && entry.name !== masterName)
        .map((entry) => entry.name);
      const chronicleLines: string[] = [];
      let classified = 0;
      const materialPaths: string[] = [];
      for (const fileName of rootFiles) {
        const source = join(target, fileName);
        const classification = classifyMaterial(source);
        const targetDir = join(target, classification.suggestedFolder);
        mkdirSync(targetDir, { recursive: true });
        const dot = fileName.lastIndexOf(".");
        const destination = uniqueFileName(
          targetDir,
          dot > 0 ? fileName.slice(0, dot) : fileName,
          dot > 0 ? fileName.slice(dot) : "",
        );
        renameSync(source, destination);
        chronicleLines.push(`${fileName}（${classification.label}，归入 ${classification.suggestedFolder}/）`);
        classified += 1;
        if (classification.suggestedFolder === "材料") materialPaths.push(destination);
      }

      // 登记案件。
      const stageList = DEFAULT_LITIGATION_STAGES;
      const stageIndex = decision.type === "litigation"
        ? normalizeStageIndex(decision.stageIndex ?? 0, stageList.length)
        : undefined;
      const caseItem: Case = {
        id: crypto.randomUUID(),
        title,
        type: decision.type,
        stage: decision.type === "litigation" ? stageList[stageIndex!] : "收案",
        stageIndex,
        stageHistory: decision.type === "litigation"
          ? [{ stageIndex: stageIndex!, stage: stageList[stageIndex!], changedAt: now, note: "既有案卷导入" }]
          : undefined,
        status: decision.status,
        vaultPath: target,
        parties: decision.parties,
        court: decision.court,
        caseNumber: decision.caseNumber,
        createdAt: now,
      };
      store.cases.push(caseItem);
      storeChanged = true;

      // 从文件名推断期限（复用材料智能的规则投射）。
      const classifications = classifyMaterials(materialPaths);
      const inferredDeadlines = inferDeadlines(classifications);
      const seenDeadlines = new Set<string>();
      let deadlineCount = 0;
      for (const inferred of inferredDeadlines) {
        const key = `${inferred.title}|${inferred.date}`;
        if (seenDeadlines.has(key)) continue;
        seenDeadlines.add(key);
        const deadline: Deadline = {
          id: crypto.randomUUID(),
          caseId: caseItem.id,
          title: inferred.title,
          date: inferred.date,
          type: inferred.type,
          status: "proposed",
          createdAt: now,
        };
        deadline.vaultPath = createDeadlineFile(target, inferred.title, inferred.date, "待确认");
        store.deadlines.push(deadline);
        deadlineCount += 1;
      }

      // 开庭/听证类文件带日期 → 日程。
      let scheduleCount = 0;
      const seenSchedules = new Set<string>();
      for (const filePath of materialPaths) {
        const fileName = basename(filePath);
        if (!SCHEDULE_FILE_KEYWORDS.some((kw) => fileName.includes(kw))) continue;
        const dates = extractDates(fileName);
        if (dates.length === 0) continue;
        const date = dates[dates.length - 1];
        const title = fileName.replace(/\.[^.]+$/, "");
        const key = `${title}|${date}`;
        if (seenSchedules.has(key)) continue;
        seenSchedules.add(key);
        const schedule: Schedule = {
          id: crypto.randomUUID(),
          caseId: caseItem.id,
          title,
          datetime: `${date}T09:00:00`,
          type: "court-hearing",
          createdAt: now,
        };
        store.schedules.push(schedule);
        createScheduleFile(target, title, date);
        scheduleCount += 1;
      }

      // 根目录散落文件按用户指派并入本案材料。
      moveLooseFilesInto(target, decision.looseFiles ?? [], chronicleLines);

      // 大事记留痕 + 核对任务。
      createImportChronicle(target, today, chronicleLines.length > 0 ? chronicleLines : ["（无散文件，原结构保留）"]);
      const reviewDetail = `本案由既有案卷整理向导导入（原路径：${decision.sourcePath}）。请核对：案件类型/阶段/当事人是否准确，${classified} 份文件的归类是否合适，推断的 ${deadlineCount} 个期限与 ${scheduleCount} 个日程是否成立。`;
      const reviewTask: Task = {
        id: crypto.randomUUID(),
        caseId: caseItem.id,
        title: "核对既有案卷整理结果",
        detail: reviewDetail,
        assignee: "Justice",
        status: "待办",
        priority: "medium",
        createdAt: now,
      };
      reviewTask.vaultPath = createTaskFile(target, reviewTask.title, reviewDetail);
      store.tasks.push(reviewTask);

      item.ok = true;
      item.caseId = caseItem.id;
      item.title = title;
      item.targetPath = target;
      item.classifiedFiles = classified;
      item.deadlines = deadlineCount;
      item.schedules = scheduleCount;
      result.casesCreated += 1;
      result.deadlinesCreated += deadlineCount;
      result.schedulesCreated += scheduleCount;
      result.reviewTasksCreated += 1;
    } catch (error) {
      item.error = error instanceof Error ? error.message : String(error);
    }
  }

  if (storeChanged) writeStore(cwd, store);
  return result;
}
