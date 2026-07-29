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
  status: CaseStatus;
  vaultPath: string;
  createdAt: string;
}

export type TaskStatus = "待办" | "进行中" | "完成" | "取消";
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
export type DeadlineStatus = "pending" | "done" | "missed";

export interface Deadline {
  id: string;
  caseId: string;
  title: string;
  date: string;
  type: DeadlineType;
  status: DeadlineStatus;
  createdAt: string;
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
