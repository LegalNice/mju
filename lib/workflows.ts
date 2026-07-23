import type { Case, CaseType, DeliverableType, MjuStore, Task, TaskPriority, WorkflowRun } from "./mju-models";

export type WorkflowId = "litigation-intake" | "contract-review" | "legal-research";

export interface WorkflowTaskTemplate {
  title: string;
  detail: string;
  assignee: string;
  priority: TaskPriority;
  deliverableType: DeliverableType;
  deadlineOffsetDays?: number;
}

export interface WorkflowDefinition {
  id: WorkflowId;
  name: string;
  description: string;
  caseTypes: CaseType[];
  tasks: WorkflowTaskTemplate[];
}

export const WORKFLOWS: WorkflowDefinition[] = [
  {
    id: "litigation-intake",
    name: "收案至庭前准备",
    description: "为争议解决案件建立材料、检索、策略、文书和庭前准备任务链。",
    caseTypes: ["litigation"],
    tasks: [
      { title: "建立材料清单并核对缺口", detail: "按案卷现有材料列明事实、证据、授权和程序文件缺口。", assignee: "Chariot", priority: "high", deliverableType: "evidence-list", deadlineOffsetDays: 2 },
      { title: "梳理关键事实与争点", detail: "形成可供后续检索和文书使用的事实时间线、争点和待核实事项。", assignee: "Justice", priority: "high", deliverableType: "internal-opinion", deadlineOffsetDays: 4 },
      { title: "完成法律检索", detail: "围绕已确认争点检索现行法、司法解释和裁判口径，注明待核验来源。", assignee: "Chariot", priority: "medium", deliverableType: "research-report", deadlineOffsetDays: 6 },
      { title: "形成诉讼策略意见", detail: "结合诉请、构成要件、举证责任和风险提出可执行的诉讼策略。", assignee: "Justice", priority: "high", deliverableType: "internal-opinion", deadlineOffsetDays: 8 },
      { title: "起草庭审／诉讼文书初稿", detail: "根据案件阶段起草相应文书，并标记仍待确认的事实或证据。", assignee: "Magician", priority: "medium", deliverableType: "pleading", deadlineOffsetDays: 10 },
    ],
  },
  {
    id: "contract-review",
    name: "合同审查与修订",
    description: "为法律顾问项目建立收件、检索、风险意见与修订稿任务链。",
    caseTypes: ["advisory"],
    tasks: [
      { title: "核对合同文本与交易背景", detail: "确认版本、交易结构、主体、商业条款和客户关注事项。", assignee: "Chariot", priority: "high", deliverableType: "other", deadlineOffsetDays: 1 },
      { title: "检索适用规则与交易风险", detail: "围绕交易类型、监管要求和争议高发条款进行定向检索。", assignee: "Chariot", priority: "medium", deliverableType: "research-report", deadlineOffsetDays: 3 },
      { title: "形成内部审查意见", detail: "按风险、商业影响和建议修改方向整理内部审查意见。", assignee: "Justice", priority: "high", deliverableType: "internal-opinion", deadlineOffsetDays: 4 },
      { title: "制作修订稿及对外说明", detail: "在不擅自补充未知商业事实的前提下完成修订稿和必要说明。", assignee: "Magician", priority: "medium", deliverableType: "docx-revision", deadlineOffsetDays: 6 },
    ],
  },
  {
    id: "legal-research",
    name: "专项法律检索",
    description: "用于独立法律问题的拆题、检索和内部报告交付。",
    caseTypes: ["advisory", "litigation"],
    tasks: [
      { title: "明确问题与检索边界", detail: "拆分法律问题、事实前提、适用地域和待核验口径。", assignee: "Justice", priority: "high", deliverableType: "internal-opinion", deadlineOffsetDays: 1 },
      { title: "完成法规与案例检索", detail: "检索并整理可核验的法规、司法解释、案例和监管口径。", assignee: "Chariot", priority: "medium", deliverableType: "research-report", deadlineOffsetDays: 3 },
      { title: "撰写检索结论", detail: "形成有明确结论、适用前提、风险和后续动作的内部报告。", assignee: "Justice", priority: "high", deliverableType: "research-report", deadlineOffsetDays: 4 },
    ],
  },
];

export function listWorkflows(caseType?: CaseType): WorkflowDefinition[] {
  return WORKFLOWS.filter((workflow) => !caseType || workflow.caseTypes.includes(caseType));
}

export function findWorkflow(workflowId: string): WorkflowDefinition | undefined {
  return WORKFLOWS.find((workflow) => workflow.id === workflowId);
}

export function workflowAlreadyStarted(store: MjuStore, caseId: string, workflowId: string): boolean {
  return store.workflowRuns.some((run) => run.caseId === caseId && run.workflowId === workflowId);
}

export function buildWorkflowTasks(caseItem: Case, workflow: WorkflowDefinition, now = new Date()): Task[] {
  const startedAt = now.toISOString();
  return workflow.tasks.map((template) => ({
    id: crypto.randomUUID(),
    caseId: caseItem.id,
    title: template.title,
    detail: template.detail,
    assignee: template.assignee,
    status: "待办",
    priority: template.priority,
    deadline: template.deadlineOffsetDays === undefined ? undefined : dateAfter(now, template.deadlineOffsetDays),
    deliverableType: template.deliverableType,
    workflowId: workflow.id,
    createdAt: startedAt,
  }));
}

export function startWorkflow(store: MjuStore, caseItem: Case, workflow: WorkflowDefinition, now = new Date()): { run: WorkflowRun; tasks: Task[] } {
  const tasks = buildWorkflowTasks(caseItem, workflow, now);
  const run: WorkflowRun = {
    id: crypto.randomUUID(),
    workflowId: workflow.id,
    caseId: caseItem.id,
    taskIds: tasks.map((task) => task.id),
    startedAt: now.toISOString(),
  };
  store.tasks.push(...tasks);
  store.workflowRuns.push(run);
  return { run, tasks };
}

function dateAfter(now: Date, offsetDays: number): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
  return date.toISOString().slice(0, 10);
}
