// Mju Agents 法律领域模型
// 所有时间字段使用 ISO 8601 字符串

export interface Client {
  id: string;
  name: string;
  type: "company" | "individual";
  contact?: string;
  contractPeriod?: { start: string; end: string };
  vaultPath?: string;
  createdAt: string;
}

export type CaseType = "advisory" | "litigation" | "project";
export type CaseStatus = "active" | "dormant" | "closed";

/** Ordered default lifecycle for litigation matters. */
export const DEFAULT_LITIGATION_STAGES = [
  "接案",
  "立案",
  "举证",
  "庭前会议",
  "开庭",
  "等待判决",
  "执行",
  "结案",
] as const;

/** Maps stage labels persisted by earlier releases to the current lifecycle. */
export const LEGACY_LITIGATION_STAGE_INDEX: Record<string, number> = {
  "收案": 0,
  "接案": 0,
  "立案": 1,
  "答辩": 2,
  "举证": 2,
  "证据交换": 2,
  "庭前准备": 3,
  "庭前会议": 3,
  "开庭审理": 4,
  "开庭": 4,
  "裁判": 5,
  "等待判决": 5,
  "上诉": 5,
  "执行": 6,
  "结案": 7,
};

export function litigationStageIndexFor(value: unknown): number | undefined {
  return typeof value === "string" ? LEGACY_LITIGATION_STAGE_INDEX[value] : undefined;
}

export interface CaseStageHistoryEntry {
  stageIndex: number;
  stage: string;
  changedAt: string;
  /** 阶段大事记：推进时补记或事后点击阶段点补录。 */
  note?: string;
}

/** Clamp persisted or user-supplied litigation progress to the default lifecycle. */
export function normalizeLitigationStageIndex(value: unknown): number {
  const index = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(index, 0), DEFAULT_LITIGATION_STAGES.length - 1);
}

/** Clamp a stage index to an arbitrary stage list length (custom stages included). */
export function normalizeStageIndex(value: unknown, length: number): number {
  const index = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

/** Resolve the ordered stage labels for a case: custom stages override the default lifecycle. */
export function resolveCaseStages(caseItem: Pick<Case, "type" | "customStages">): readonly string[] {
  if (caseItem.customStages && caseItem.customStages.length > 0) return caseItem.customStages;
  return DEFAULT_LITIGATION_STAGES;
}

export interface Case {
  id: string;
  title: string;
  type: CaseType;
  clientId?: string;
  parties?: {
    plaintiff?: string;
    defendant?: string;
    other?: string[];
  };
  court?: string;
  caseNumber?: string;
  stage: string;
  /** Current position in DEFAULT_LITIGATION_STAGES; only meaningful for litigation cases. */
  stageIndex?: number;
  /** 自定义阶段（覆盖默认八阶段）；未设置时用 DEFAULT_LITIGATION_STAGES。 */
  customStages?: string[];
  /** Audit trail of current-stage changes, oldest first. */
  stageHistory?: CaseStageHistoryEntry[];
  status: CaseStatus;
  vaultPath: string;
  createdAt: string;
}

export type TaskStatus = "待办" | "进行中" | "待验收" | "完成" | "取消";
export type TaskPriority = "high" | "medium" | "low";
export type DeliverableType =
  | "internal-opinion"
  | "external-opinion"
  | "docx-revision"
  | "pleading"
  | "evidence-list"
  | "trial-outline"
  | "research-report"
  | "other";

export interface Task {
  id: string;
  caseId: string;
  title: string;
  detail: string;
  assignee: string;
  status: TaskStatus;
  priority?: TaskPriority;
  deadline?: string;
  estimatedHours?: number;
  actualHours?: number;
  deliverableType?: DeliverableType;
  deliverablePath?: string;
  relatedFiles?: string[];
  workflowId?: string;
  sessionId?: string;              // 绑定的 pi 会话 id（进入页发起的任务）
  originPrompt?: string;           // 用户原始指令（任务子页左栏展示）
  /** Vault 任务 Markdown 的绝对路径。任务正文与业务状态以该文件为准。 */
  vaultPath?: string;
  /** 仅用于 API 返回的统一任务投影，不作为独立的第二份业务数据。 */
  source?: "store" | "vault";
  createdAt: string;
  completedAt?: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  caseId: string;
  taskIds: string[];
  startedAt: string;
}

export type DeadlineType = "court" | "filing" | "client" | "internal";
export type DeadlineStatus = "proposed" | "pending" | "done" | "missed";

export interface Deadline {
  id: string;
  caseId: string;
  title: string;
  date: string;
  type: DeadlineType;
  status: DeadlineStatus;
  createdAt: string;
  /** Vault 期限 Markdown 的绝对路径。有值时状态/日期变更会同步写回该文件。 */
  vaultPath?: string;
}

export type ScheduleType = "court-hearing" | "client-meeting" | "internal-meeting" | "other";

export interface Schedule {
  id: string;
  caseId: string;
  title: string;
  datetime: string;
  location?: string;
  type: ScheduleType;
  createdAt: string;
}

export type DeliverableStatus = "draft" | "internal-review" | "client-review" | "final" | "archived";

export interface Deliverable {
  id: string;
  caseId: string;
  taskId?: string;
  title: string;
  type: DeliverableType;
  filePath: string;
  status: DeliverableStatus;
  version: number;
  createdAt: string;
}

export interface MjuStore {
  version: 1;
  projectName: string;
  projectType?: CaseType;
  isObsidianVault?: boolean;
  cwd?: string;                  // 项目根目录绝对路径（writeStore 自动回填，供项目列表解码）
  clients: Client[];
  cases: Case[];
  tasks: Task[];
  deadlines: Deadline[];
  schedules: Schedule[];
  deliverables: Deliverable[];
  workflowRuns: WorkflowRun[];
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_STORE: Omit<MjuStore, "projectName" | "createdAt" | "updatedAt"> = {
  version: 1,
  clients: [],
  cases: [],
  tasks: [],
  deadlines: [],
  schedules: [],
  deliverables: [],
  workflowRuns: [],
};

export function createEmptyStore(projectName: string): MjuStore {
  const now = new Date().toISOString();
  return {
    version: 1,
    clients: [],
    cases: [],
    tasks: [],
    deadlines: [],
    schedules: [],
    deliverables: [],
    workflowRuns: [],
    projectName,
    createdAt: now,
    updatedAt: now,
  };
}

export function touchStore(store: MjuStore): MjuStore {
  return { ...store, updatedAt: new Date().toISOString() };
}
