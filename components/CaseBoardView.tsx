"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Case, Deadline, Deliverable, DeliverableStatus, Schedule, Task, TaskPriority, TaskStatus } from "@/lib/mju-models";
import type { WorkflowDefinition } from "@/lib/workflows";
import { aggregateDateRisks, formatDateRisk } from "@/lib/date-risk";
import {
  CaseDocumentSummary,
  CaseRiskSummary,
  CaseStageProgress,
  CaseTimeline,
  type CaseRisk,
  type CaseTimelineEvent,
} from "./CaseDashboardComponents";
import { AppNav } from "./AppNav";
import { useI18n } from "./I18nProvider";

const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const COLUMNS: Array<Exclude<TaskStatus, "取消">> = ["待办", "进行中", "待验收", "完成"];

const CASE_TYPE_LABEL: Record<Case["type"], string> = {
  litigation: "争议解决",
  advisory: "顾问",
  project: "专项",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  draft: "草稿",
  "internal-review": "内审",
  "client-review": "客户审",
  final: "定稿",
  archived: "归档",
};

/** draft → internal-review → client-review → final → archived */
const DELIVERABLE_STATUS_FLOW: DeliverableStatus[] = [
  "draft",
  "internal-review",
  "client-review",
  "final",
  "archived",
];

type WorkflowSummary = WorkflowDefinition & { started: boolean };
type DashboardView = "tasks" | "timeline" | "documents";

interface CaseDocEntry {
  path: string;
  relPath: string;
  name: string;
  mtime: string;
  size: number;
}

interface WorkflowPreview {
  workflow: WorkflowDefinition;
  tasks: Task[] | null; // null = 预览加载中
}

function todayString(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" → "M-D"（如 7-25） */
function formatDeadline(deadline: string): string {
  const parts = deadline.slice(0, 10).split("-");
  if (parts.length < 3) return deadline;
  return `${Number(parts[1])}-${Number(parts[2])}`;
}

function CenteredNote({ text }: { text: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ ...MICRO, color: "var(--text-dim)" }}>{text}</span>
    </div>
  );
}

/** 任务菜单里的一行：自带 hover 底色，disabled 时置灰不可点 */
function MenuRow({
  onClick,
  disabled,
  micro,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  micro?: boolean;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: micro ? "7px 12px" : "8px 12px",
        border: "none",
        background: hover && !disabled ? "var(--bg-hover)" : "transparent",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "var(--text-dim)" : "var(--text)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        ...(micro ? MICRO : { fontSize: 12 }),
      }}
    >
      {children}
    </button>
  );
}

/** 卡片右上角的 ⋯ 触发按钮：hover 卡片时淡入，自身 hover 变 accent */
function DotsButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label="任务操作"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute",
        top: 6,
        right: 8,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: "2px 4px",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        lineHeight: 1,
        color: hover ? "var(--accent)" : "var(--text-muted)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity .15s",
      }}
    >
      ⋯
    </button>
  );
}

/** 刊头 micro 文本按钮：muted → hover accent */
function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...MICRO,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: 0,
        color: hover ? "var(--accent)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}

/** 模态底部按钮：outline（描边）或 accent（实心） */
function ModalButton({
  onClick,
  variant,
  disabled,
  children,
}: {
  onClick: () => void;
  variant: "outline" | "accent";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const accent = variant === "accent";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...MICRO,
        padding: "8px 16px",
        borderRadius: 2,
        border: accent ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: accent
          ? hover && !disabled
            ? "var(--accent-hover)"
            : "var(--accent)"
          : hover && !disabled
            ? "var(--bg-hover)"
            : "transparent",
        color: accent ? "#ffffff" : "var(--text)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** 菜单内两步确认用的小按钮 */
function TinyButton({
  onClick,
  accent,
  disabled,
  children,
}: {
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...MICRO,
        letterSpacing: "0.06em",
        padding: "3px 8px",
        borderRadius: 2,
        border: accent ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: accent
          ? hover && !disabled
            ? "var(--accent-hover)"
            : "var(--accent)"
          : hover && !disabled
            ? "var(--bg-hover)"
            : "transparent",
        color: accent ? "#ffffff" : "var(--text-muted)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function CaseBoardView({ caseId }: { caseId: string }) {
  const { text: tr } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cwd = searchParams.get("cwd") ?? "";
  const newTaskId = searchParams.get("new");

  const [cases, setCases] = useState<Case[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [documents, setDocuments] = useState<CaseDocEntry[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[] | null>(null);
  const [dashboardView, setDashboardView] = useState<DashboardView>("tasks");
  const [stagePending, setStagePending] = useState<"next" | "previous" | "undo" | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [deliverableError, setDeliverableError] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wfMenuOpen, setWfMenuOpen] = useState(false);
  const [preview, setPreview] = useState<WorkflowPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null);
  const [taskMenuShown, setTaskMenuShown] = useState(false);
  const [taskMenuError, setTaskMenuError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [caseQuery, setCaseQuery] = useState("");
  // 任务列筛选：隐藏已完成 / 关键词 / 负责人 / 优先级
  const [taskFilter, setTaskFilter] = useState({
    hideCompleted: false,
    keyword: "",
    assignee: "",
    priority: "",
  });
  // HTML5 拖拽移动任务：记录被拖任务与当前悬停列
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetCol, setDropTargetCol] = useState<TaskStatus | null>(null);
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(new Set());
  const prevRunningRef = useRef<Set<string>>(new Set());
  const [importingMaterials, setImportingMaterials] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wfMenuRef = useRef<HTMLDivElement | null>(null);
  const taskMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadCases = useCallback(async () => {
    const res = await fetch(`/api/cases?cwd=${encodeURIComponent(cwd)}`);
    if (!res.ok) throw new Error(`cases ${res.status}`);
    const data = (await res.json()) as { cases: Case[] };
    setCases(data.cases);
  }, [cwd]);

  // 一次取回整个项目的任务（API 已按 deadline 排序）：看板按 caseId 过滤，
  // 切换菜单的任务计数也由此得出。
  const loadTasks = useCallback(async () => {
    const res = await fetch(`/api/tasks?cwd=${encodeURIComponent(cwd)}`);
    if (!res.ok) throw new Error(`tasks ${res.status}`);
    const data = (await res.json()) as { tasks: Task[] };
    setTasks(data.tasks);
  }, [cwd]);

  // 当前案件可用的工作流（按案件类型过滤，带 started 标记）
  const loadWorkflows = useCallback(async () => {
    const res = await fetch(
      `/api/workflows?cwd=${encodeURIComponent(cwd)}&caseId=${encodeURIComponent(caseId)}`,
    );
    if (!res.ok) throw new Error(`workflows ${res.status}`);
    const data = (await res.json()) as { workflows: WorkflowSummary[] };
    setWorkflows(data.workflows);
  }, [cwd, caseId]);

  // 当前案件的交付物（API 按 createdAt 倒序）
  const loadDeliverables = useCallback(async () => {
    const res = await fetch(
      `/api/deliverables?cwd=${encodeURIComponent(cwd)}&caseId=${encodeURIComponent(caseId)}`,
    );
    if (!res.ok) throw new Error(`deliverables ${res.status}`);
    const data = (await res.json()) as { deliverables: Deliverable[] };
    setDeliverables(data.deliverables);
  }, [cwd, caseId]);

  const loadCaseContext = useCallback(async () => {
    const [deadlineRes, scheduleRes, docsRes] = await Promise.all([
      fetch(`/api/deadlines?cwd=${encodeURIComponent(cwd)}&caseId=${encodeURIComponent(caseId)}`),
      fetch(`/api/schedules?cwd=${encodeURIComponent(cwd)}&caseId=${encodeURIComponent(caseId)}`),
      fetch(`/api/casedocs?cwd=${encodeURIComponent(cwd)}&caseId=${encodeURIComponent(caseId)}`),
    ]);
    if (!deadlineRes.ok || !scheduleRes.ok || !docsRes.ok) throw new Error("case context load failed");
    const [deadlineData, scheduleData, docsData] = await Promise.all([
      deadlineRes.json() as Promise<{ deadlines: Deadline[] }>,
      scheduleRes.json() as Promise<{ schedules: Schedule[] }>,
      docsRes.json() as Promise<{ docs: CaseDocEntry[] }>,
    ]);
    setDeadlines(deadlineData.deadlines);
    setSchedules(scheduleData.schedules);
    setDocuments(docsData.docs);
  }, [cwd, caseId]);

  useEffect(() => {
    if (!cwd) {
      setError("missing cwd");
      return;
    }
    setError(null);
    Promise.all([loadCases(), loadTasks(), loadWorkflows(), loadDeliverables(), loadCaseContext()]).catch(() =>
      setError("load failed"),
    );
  }, [cwd, loadCases, loadTasks, loadWorkflows, loadDeliverables, loadCaseContext]);

  const currentCase = useMemo(
    () => cases?.find((c) => c.id === caseId) ?? null,
    [cases, caseId],
  );

  const caseTasks = useMemo(
    () => (tasks ?? []).filter((t) => t.caseId === caseId && t.status !== "取消"),
    [tasks, caseId],
  );

  // 看板筛选后的任务：先过滤再按列分组；隐藏已完成 = 整列移除「完成」
  const filteredCaseTasks = useMemo(() => {
    const kw = taskFilter.keyword.trim().toLowerCase();
    return caseTasks.filter((t) => {
      if (taskFilter.hideCompleted && t.status === "完成") return false;
      if (taskFilter.assignee && t.assignee !== taskFilter.assignee) return false;
      if (taskFilter.priority && t.priority !== taskFilter.priority) return false;
      if (kw) {
        const hay = `${t.title} ${t.detail ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [caseTasks, taskFilter]);

  const assigneeOptions = useMemo(
    () => Array.from(new Set(caseTasks.map((t) => t.assignee).filter(Boolean))).sort(),
    [caseTasks],
  );

  const visibleColumns = useMemo(
    () => COLUMNS.filter((status) => !(taskFilter.hideCompleted && status === "完成")),
    [taskFilter.hideCompleted],
  );

  useEffect(() => {
    if (!cwd) return;
    try {
      const stored = localStorage.getItem(`mju-case-dashboard-view:${cwd}:${caseId}`);
      if (stored === "tasks" || stored === "timeline" || stored === "documents") setDashboardView(stored);
      else setDashboardView("tasks");
    } catch {
      setDashboardView("tasks");
    }
  }, [cwd, caseId]);

  const selectDashboardView = useCallback((view: DashboardView) => {
    setDashboardView(view);
    try {
      localStorage.setItem(`mju-case-dashboard-view:${cwd}:${caseId}`, view);
    } catch {
      // localStorage is an optional display preference only.
    }
  }, [cwd, caseId]);

  const taskCountByCase = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks ?? []) {
      if (task.status === "取消") continue;
      counts.set(task.caseId, (counts.get(task.caseId) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const caseRiskItems = useMemo(() => {
    const risks = aggregateDateRisks({ tasks: caseTasks, deadlines, schedules }, { upcomingDays: 7 });
    return risks.filter((item) => item.level !== "normal");
  }, [caseTasks, deadlines, schedules]);

  const caseRisks = useMemo<CaseRisk[]>(() => caseRiskItems.map((item) => ({
    id: `${item.kind}:${item.id}`,
    title: item.title,
    level: item.level === "overdue" ? "critical" : item.level === "due-today" || item.level === "upcoming" ? "warning" : "info",
    detail: formatDateRisk(item),
    dueDate: item.date,
    source: item.kind === "task" ? "任务" : item.kind === "deadline" ? "期限" : "日程",
  })), [caseRiskItems]);

  const timelineEvents = useMemo<CaseTimelineEvent[]>(() => {
    const events: CaseTimelineEvent[] = [];
    for (const task of caseTasks) {
      events.push({
        id: `task-created:${task.id}`,
        date: task.completedAt ?? task.createdAt,
        title: task.title,
        kind: "task",
        detail: task.completedAt ? "任务完成" : task.status,
        href: `/task/${task.id}?cwd=${encodeURIComponent(cwd)}`,
      });
    }
    for (const deadline of deadlines) {
      events.push({
        id: `deadline:${deadline.id}`,
        date: deadline.date,
        title: deadline.title,
        kind: "deadline",
        detail: deadline.status === "done" ? "已完成" : "期限",
        overdue: deadline.status !== "done" && deadline.date.slice(0, 10) < todayString(),
      });
    }
    for (const schedule of schedules) {
      events.push({
        id: `schedule:${schedule.id}`,
        date: schedule.datetime,
        title: schedule.title,
        kind: "note",
        detail: schedule.type,
      });
    }
    for (const deliverable of deliverables ?? []) {
      events.push({
        id: `deliverable:${deliverable.id}`,
        date: deliverable.createdAt,
        title: deliverable.title,
        kind: "document",
        detail: DELIVERABLE_STATUS_LABEL[deliverable.status],
      });
    }
    for (const entry of currentCase?.stageHistory ?? []) {
      events.push({
        id: `stage:${entry.changedAt}:${entry.stageIndex}`,
        date: entry.changedAt,
        title: entry.stage,
        kind: "stage",
        detail: "案件阶段更新",
      });
    }
    return events;
  }, [caseTasks, deadlines, schedules, deliverables, currentCase, cwd]);

  const inProgressCount = caseTasks.filter((task) => task.status === "进行中").length;
  const upcomingCount = caseRiskItems.length;
  const openDeliverableCount = (deliverables ?? []).filter((item) => item.status !== "archived").length;
  const currentStageIndex = currentCase?.type === "litigation" ? currentCase.stageIndex ?? 0 : 0;
  const canMoveStageForward = currentCase?.type === "litigation" && currentStageIndex < 7;
  const canMoveStageBackward = currentCase?.type === "litigation" && currentStageIndex > 0;

  // 「改派到」候选：排除当前案件；收件箱恒置底不受搜索过滤
  const reassignCases = useMemo(() => {
    const others = (cases ?? []).filter((c) => c.id !== caseId);
    const q = caseQuery.trim().toLowerCase();
    const inbox = others.filter((c) => c.stage === "收件箱");
    const rest = others.filter((c) => c.stage !== "收件箱");
    const filtered = q ? rest.filter((c) => c.title.toLowerCase().includes(q)) : rest;
    return { filtered, inbox, total: others.length, query: q };
  }, [cases, caseId, caseQuery]);

  // 有进行中任务时每 5s 轮询一次任务列表
  const hasInProgress = caseTasks.some((t) => t.status === "进行中");
  useEffect(() => {
    if (!cwd || !hasInProgress) return;
    const timer = setInterval(() => {
      loadTasks().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [cwd, hasInProgress, loadTasks]);

  // 运行中会话：SSE 推送当前 running session id 集合（同 SessionSidebar）
  useEffect(() => {
    const source = new EventSource("/api/agent/running/events");
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as { type?: string; runningSessionIds?: string[] };
        if (data.type === "running") {
          setRunningSessionIds(new Set(data.runningSessionIds ?? []));
        }
      } catch {
        // 忽略畸形帧
      }
    };
    return () => source.close();
  }, []);

  // Auto-transition session-bound tasks between 进行中 ↔ 待验收 based on
  // running/idle transitions of their agent sessions.
  const caseTasksRef = useRef(caseTasks);
  caseTasksRef.current = caseTasks;
  useEffect(() => {
    const prev = prevRunningRef.current;
    const curr = runningSessionIds;
    prevRunningRef.current = curr;

    const stopped: string[] = [];
    const started: string[] = [];
    for (const id of prev) { if (!curr.has(id)) stopped.push(id); }
    for (const id of curr) { if (!prev.has(id)) started.push(id); }

    if (stopped.length === 0 && started.length === 0) return;

    const tasks = caseTasksRef.current;
    for (const sessionId of stopped) {
      const task = tasks.find((t) => t.sessionId === sessionId && t.status === "进行中");
      if (!task) continue;
      fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, id: task.id, status: "待验收" }),
      }).catch(() => {});
    }
    for (const sessionId of started) {
      const task = tasks.find((t) => t.sessionId === sessionId && t.status === "待验收");
      if (!task) continue;
      fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, id: task.id, status: "进行中" }),
      }).catch(() => {});
    }
  }, [runningSessionIds, cwd]);
  

  // 记住最后查看的案件，供 /board 索引页直接跳转
  useEffect(() => {
    if (!cwd || !currentCase) return;
    try {
      localStorage.setItem("mju-last-case", JSON.stringify({ cwd, caseId: currentCase.id }));
    } catch {
      // localStorage 不可用时静默
    }
  }, [cwd, currentCase]);

  // 点击菜单外部时收起案件切换菜单
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // 点击外部时收起工作流下拉
  useEffect(() => {
    if (!wfMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wfMenuRef.current && !wfMenuRef.current.contains(e.target as Node)) {
        setWfMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [wfMenuOpen]);

  // 点击卡片外部时收起任务操作菜单
  useEffect(() => {
    if (!openTaskMenuId) return;
    const onDown = (e: MouseEvent) => {
      if (taskMenuRef.current && !taskMenuRef.current.contains(e.target as Node)) {
        setOpenTaskMenuId(null);
        setTaskMenuError(null);
        setConfirmingDelete(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openTaskMenuId]);

  // 菜单挂载后下一帧淡入（opacity transition）；关闭时清空改派搜索词
  useEffect(() => {
    if (!openTaskMenuId) {
      setTaskMenuShown(false);
      setCaseQuery("");
      return;
    }
    const raf = requestAnimationFrame(() => setTaskMenuShown(true));
    return () => cancelAnimationFrame(raf);
  }, [openTaskMenuId]);

  const toggleTaskMenu = useCallback((taskId: string) => {
    setOpenTaskMenuId((open) => (open === taskId ? null : taskId));
    setTaskMenuError(null);
    setConfirmingDelete(false);
  }, []);

  // 状态流转 / 改派案件：成功后关闭菜单并重新拉取任务列表；
  // 失败时错误文本显示在菜单内，菜单保持打开。
  const patchTask = useCallback(
    async (taskId: string, patch: { status?: TaskStatus; caseId?: string }) => {
      try {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd, id: taskId, ...patch }),
        });
        if (!res.ok) throw new Error(`patch ${res.status}`);
        setOpenTaskMenuId(null);
        setTaskMenuError(null);
        await loadTasks();
      } catch {
        setTaskMenuError("操作失败，请重试");
      }
    },
    [cwd, loadTasks],
  );

  const updateCaseStage = useCallback(async (action: "next" | "previous" | "undo") => {
    if (!currentCase || stagePending) return;
    const actionLabel = action === "next" ? "推进" : action === "previous" ? "回退" : "撤销上次变更";
    if (!window.confirm(`确认${actionLabel}案件阶段？`)) return;
    setStagePending(action);
    setStageError(null);
    try {
      const res = await fetch("/api/cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, id: currentCase.id, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { case?: Case; error?: string };
      if (!res.ok || !data.case) throw new Error(data.error ?? `patch case ${res.status}`);
      setCases((items) => (items ?? []).map((item) => (item.id === data.case?.id ? data.case : item)));
    } catch (err) {
      setStageError(err instanceof Error ? err.message : "阶段更新失败，请重试");
    } finally {
      setStagePending(null);
    }
  }, [cwd, currentCase, stagePending]);

  // 中断执行：POST abort 后关菜单，运行脉冲随 SSE 推送自动消失
  const abortTask = useCallback(async (task: Task) => {
    if (!task.sessionId) return;
    try {
      const res = await fetch(`/api/agent/${task.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "abort" }),
      });
      if (!res.ok) throw new Error(`abort ${res.status}`);
      setOpenTaskMenuId(null);
      setTaskMenuError(null);
    } catch {
      setTaskMenuError("中断失败，请重试");
    }
  }, []);

  // 删除任务（两步确认后调用）：运行中的任务先 abort（失败也继续删），再 DELETE
  const deleteTask = useCallback(
    async (task: Task) => {
      try {
        if (task.sessionId && runningSessionIds.has(task.sessionId)) {
          await fetch(`/api/agent/${task.sessionId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "abort" }),
          }).catch(() => {});
        }
        const res = await fetch(
          `/api/tasks?cwd=${encodeURIComponent(cwd)}&id=${encodeURIComponent(task.id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error(`delete ${res.status}`);
        setOpenTaskMenuId(null);
        setTaskMenuError(null);
        setConfirmingDelete(false);
        await loadTasks();
      } catch {
        setTaskMenuError("删除失败，请重试");
      }
    },
    [cwd, loadTasks, runningSessionIds],
  );

  // 交付物状态推进：点击 chip 进入下一状态（archived 不可再点），
  // 成功用响应更新本地，失败在交付物区底部显示错误行
  const advanceDeliverable = useCallback(
    async (deliverable: Deliverable) => {
      const index = DELIVERABLE_STATUS_FLOW.indexOf(deliverable.status);
      const next = DELIVERABLE_STATUS_FLOW[index + 1];
      if (!next || advancingId) return;
      setAdvancingId(deliverable.id);
      setDeliverableError(null);
      try {
        const res = await fetch("/api/deliverables", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd, id: deliverable.id, status: next }),
        });
        if (!res.ok) throw new Error(`patch deliverable ${res.status}`);
        const data = (await res.json()) as { deliverable: Deliverable };
        setDeliverables((list) =>
          (list ?? []).map((d) => (d.id === data.deliverable.id ? data.deliverable : d)),
        );
      } catch {
        setDeliverableError("状态更新失败，请重试");
      } finally {
        setAdvancingId(null);
      }
    },
    [cwd, advancingId],
  );

  // 选择工作流：先开模态（任务清单加载中），再拉 preview
  const openPreview = useCallback(
    async (workflow: WorkflowSummary) => {
      setWfMenuOpen(false);
      setPreview({ workflow, tasks: null });
      setPreviewError(null);
      try {
        const res = await fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd, caseId, workflowId: workflow.id, action: "preview" }),
        });
        if (!res.ok) throw new Error(`preview ${res.status}`);
        const data = (await res.json()) as { workflow: WorkflowDefinition; tasks: Task[] };
        setPreview({ workflow: data.workflow, tasks: data.tasks });
      } catch {
        setPreviewError("预览加载失败，请重试");
      }
    },
    [cwd, caseId],
  );

  const closePreview = useCallback(() => {
    setPreview(null);
    setPreviewError(null);
    setStarting(false);
  }, []);

  // 确认启动：201 关闭模态并刷新任务/工作流；409 或其他失败在模态内提示
  const startWorkflowRun = useCallback(async () => {
    if (!preview || starting) return;
    setStarting(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, caseId, workflowId: preview.workflow.id, action: "start" }),
      });
      if (res.status === 409) {
        setPreviewError("该工作流已启动过，不能重复启动");
        setStarting(false);
        return;
      }
      if (!res.ok) throw new Error(`start ${res.status}`);
      closePreview();
      await Promise.all([loadTasks(), loadWorkflows()]);
    } catch {
      setPreviewError("启动失败，请重试");
      setStarting(false);
    }
  }, [preview, starting, cwd, caseId, closePreview, loadTasks, loadWorkflows]);

  const importMaterials = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setImportingMaterials(true);
      setUploadResult(null);
      try {
        const selectedFiles = Array.from(files);
        const convertibleFiles = selectedFiles.filter((file) =>
          /\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i.test(file.name),
        );
        const directFiles = selectedFiles.filter((file) => !convertibleFiles.includes(file));
        let importedCount = 0;
        let convertedCount = 0;
        let failedCount = 0;
        let movedCount = 0;
        let deadlineCount = 0;

        if (directFiles.length > 0) {
          const formData = new FormData();
          for (const file of directFiles) formData.append("files", file);
          const materialRes = await fetch(
            `/api/cases/${caseId}/materials?cwd=${encodeURIComponent(cwd)}&conflict=overwrite`,
            { method: "POST", body: formData },
          );
          const materialData = (await materialRes.json()) as {
            uploaded?: string[];
            error?: string;
          };
          if (!materialRes.ok) {
            throw new Error(materialData.error ?? `materials ${materialRes.status}`);
          }
          importedCount = materialData.uploaded?.length ?? 0;

          const analyzeRes = await fetch(
            `/api/cases/${caseId}/materials/analyze?cwd=${encodeURIComponent(cwd)}`,
            { method: "POST" },
          );
          if (!analyzeRes.ok) throw new Error(`analyze ${analyzeRes.status}`);
          const analyzeData = (await analyzeRes.json()) as {
            createdDeadlines: { deadline: { title: string } }[];
            moved: { from: string; to: string }[];
          };
          movedCount += analyzeData.moved.length;
          deadlineCount += analyzeData.createdDeadlines.length;
        }

        if (convertibleFiles.length > 0) {
          const formData = new FormData();
          for (const file of convertibleFiles) formData.append("files", file);
          const convertRes = await fetch(
            `/api/cases/${caseId}/materials/convert?cwd=${encodeURIComponent(cwd)}`,
            { method: "POST", body: formData },
          );
          const convertData = (await convertRes.json()) as {
            saved?: string[];
            errors?: Array<{ name: string; error: string }>;
            analysis?: {
              moved: { from: string; to: string }[];
              createdDeadlines: { deadline: { title: string } }[];
            } | null;
            error?: string;
          };
          if (!convertRes.ok) {
            throw new Error(convertData.error ?? `convert ${convertRes.status}`);
          }
          convertedCount = convertData.saved?.length ?? 0;
          failedCount = convertData.errors?.length ?? 0;
          movedCount += convertData.analysis?.moved.length ?? 0;
          deadlineCount += convertData.analysis?.createdDeadlines.length ?? 0;
        }

        setUploadResult(
          `已导入 ${importedCount} 份本地材料，转换 ${convertedCount} 份为 Markdown${failedCount > 0 ? `，${failedCount} 份转换失败` : ""}；自动归位 ${movedCount} 份，创建 ${deadlineCount} 个期限。`,
        );
        await loadTasks();
      } catch (err) {
        setUploadResult(`导入失败：${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setImportingMaterials(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [caseId, cwd, loadTasks],
  );

  const boardHref = `/board/${caseId}?cwd=${encodeURIComponent(cwd)}`;
  const today = todayString();

  const shell = (content: React.ReactNode) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <AppNav boardHref={boardHref} />
      {content}
    </div>
  );

  if (error) return shell(<CenteredNote text={tr("加载失败", "Unable to load")} />);
  if (!cases || !tasks) return shell(<CenteredNote text={tr("加载中…", "Loading…")} />);
  if (!currentCase) {
    return shell(
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
      >
        <span style={{ ...MICRO, color: "var(--text-dim)" }}>{tr("案件不存在", "Case not found")}</span>
        <Link href="/board" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {tr("返回案件列表", "Back to cases")}
        </Link>
      </div>,
    );
  }

  return shell(
    <main className="case-board">
      {/* 案件卷宗页头：保留案件切换与工作入口，改用首页同源的归档层级。 */}
      <header className="case-dossier-header">
        <div className="case-dossier-kicker">
          {tr(CASE_TYPE_LABEL[currentCase.type], currentCase.type === "litigation" ? "Dispute" : currentCase.type === "advisory" ? "Advisory" : "Project")}
          <span aria-hidden="true">/</span>
          <span>{currentCase.stage}</span>
        </div>
        <div className="case-dossier-heading">
        <div ref={menuRef} className="case-dossier-switcher">
          <button
            type="button"
            className="case-dossier-title"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span>{currentCase.title}</span>
            <span className="case-dossier-title-caret">▾</span>
          </button>
          {menuOpen && (
            <div className="case-dossier-menu">
              {(cases ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push(`/board/${c.id}?cwd=${encodeURIComponent(cwd)}`);
                  }}
                  className={`case-dossier-menu-item${c.id === caseId ? " is-active" : ""}`}
                >
                  <span>{c.title}</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {taskCountByCase.get(c.id) ?? 0} {tr("任务", "tasks")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="case-dossier-actions">
          <TextButton onClick={() => fileInputRef.current?.click()}>
            {importingMaterials ? tr("导入中…", "Importing…") : tr("导入材料", "Import materials")}
          </TextButton>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".md,.markdown,.txt,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            style={{ display: "none" }}
            onChange={(e) => importMaterials(e.target.files)}
          />
          {workflows && workflows.length > 0 && (
            <div ref={wfMenuRef} style={{ position: "relative" }}>
              <TextButton onClick={() => setWfMenuOpen((open) => !open)}>{tr("启动工作流", "Start workflow")} ▾</TextButton>
              {wfMenuOpen && (
                <div className="case-dossier-menu case-workflow-menu">
                  {workflows.map((wf) => (
                    <MenuRow
                      key={wf.id}
                      disabled={wf.started}
                      onClick={() => openPreview(wf)}
                    >
                      <span
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 10,
                        }}
                      >
                        <span>{wf.name}</span>
                        {wf.started && (
                          <span style={{ ...MICRO, letterSpacing: "0.06em", color: "var(--text-dim)" }}>
                            {tr("已启动", "Started")}
                          </span>
                        )}
                      </span>
                    </MenuRow>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </header>

      {uploadResult && (
        <div
          style={{
            fontSize: 12,
            color: uploadResult.startsWith("导入失败") ? "var(--accent)" : "var(--text-muted)",
            marginBottom: 16,
          }}
        >
          {uploadResult}
        </div>
      )}

      <section className="case-stage-section">
        <CaseStageProgress
          caseItem={currentCase}
          stages={currentCase.type === "litigation"
            ? ["接案", "立案", "举证", "庭前会议", "开庭", "等待判决", "执行", "结案"].map((label) => ({ id: label, label }))
            : [{ id: currentCase.stage, label: currentCase.stage }]}
        />
        {currentCase.type === "litigation" && (
          <div className="case-stage-actions">
            <TinyButton onClick={() => void updateCaseStage("previous")} disabled={!canMoveStageBackward || Boolean(stagePending)}>回退阶段</TinyButton>
            <TinyButton accent onClick={() => void updateCaseStage("next")} disabled={!canMoveStageForward || Boolean(stagePending)}>推进阶段</TinyButton>
            <TinyButton onClick={() => void updateCaseStage("undo")} disabled={Boolean(stagePending)}>撤销上次变更</TinyButton>
            {stagePending && <span className="case-stage-feedback">更新中…</span>}
            {stageError && <span role="alert" className="case-stage-feedback is-error">{stageError}</span>}
          </div>
        )}
      </section>

      {caseRiskItems.length > 0 && (
        <div role="status" className="case-urgency-strip">
          <span className="case-urgency-strip-title">优先处理</span>
          <span className="case-urgency-strip-detail">
            {caseRiskItems.slice(0, 2).map((item) => `${item.title}（${formatDateRisk(item)}）`).join("；")}
          </span>
        </div>
      )}

      <div className="case-workgrid">
        <div className="case-workgrid-main">
          <div className="case-index-tabs">
            {([
              ["tasks", "任务"],
              ["timeline", "时间线"],
              ["documents", "文档"],
            ] as const).map(([view, label]) => (
              <button
                key={view}
                type="button"
                aria-pressed={dashboardView === view}
                onClick={() => selectDashboardView(view)}
                className={`case-index-tab${dashboardView === view ? " is-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          {dashboardView === "tasks" && (
      <>
      <div className="case-task-filterbar">
        <label className="case-task-filter-toggle">
          <input
            type="checkbox"
            checked={taskFilter.hideCompleted}
            onChange={(e) => setTaskFilter((f) => ({ ...f, hideCompleted: e.target.checked }))}
          />
          <span>{tr("隐藏已完成", "Hide done")}</span>
        </label>
        <input
          className="case-task-filter-input"
          value={taskFilter.keyword}
          placeholder={tr("筛选任务…", "Filter tasks…")}
          onChange={(e) => setTaskFilter((f) => ({ ...f, keyword: e.target.value }))}
        />
        <select
          className="case-task-filter-select"
          value={taskFilter.assignee}
          onChange={(e) => setTaskFilter((f) => ({ ...f, assignee: e.target.value }))}
        >
          <option value="">{tr("全部负责人", "All assignees")}</option>
          {assigneeOptions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          className="case-task-filter-select"
          value={taskFilter.priority}
          onChange={(e) => setTaskFilter((f) => ({ ...f, priority: e.target.value }))}
        >
          <option value="">{tr("全部优先级", "All priorities")}</option>
          <option value="high">{tr("高", "High")}</option>
          <option value="medium">{tr("中", "Medium")}</option>
          <option value="low">{tr("低", "Low")}</option>
        </select>
      </div>
      <div className="case-task-columns">
        {visibleColumns.map((status) => {
          const columnTasks = filteredCaseTasks.filter((t) => t.status === status);
          return (
            <section
              key={status}
              className={`case-task-column${dropTargetCol === status ? " is-drop-target" : ""}`}
              onDragEnter={() => {
                if (dropTargetCol !== status) setDropTargetCol(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropTargetCol((col) => (col === status ? null : col));
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dragged = draggedTaskId;
                setDraggedTaskId(null);
                setDropTargetCol(null);
                if (!dragged) return;
                const task = caseTasks.find((t) => t.id === dragged);
                if (task && task.status !== status) void patchTask(dragged, { status });
              }}
            >
              <h2 className="case-task-column-header">
                <span>{tr(status, status === "待办" ? "To do" : status === "进行中" ? "In progress" : status === "待验收" ? "Review" : "Done")}</span>
                <span>{columnTasks.length}</span>
              </h2>
              {columnTasks.map((task) => {
                const isNew = task.id === newTaskId;
                const isRunning = Boolean(task.sessionId && runningSessionIds.has(task.sessionId));
                const overdue = Boolean(task.deadline && task.deadline < today && task.status !== "完成");
                const menuOpenForTask = openTaskMenuId === task.id;
                return (
                  // 卡片包一层 relative 容器：Link 保持纯净，⋯ 按钮与菜单作为
                  // 绝对定位的兄弟节点，避免 a 内嵌 button 的非法嵌套。
                  <div
                    key={task.id}
                    ref={menuOpenForTask ? taskMenuRef : undefined}
                    className={`case-task-card-wrap${draggedTaskId === task.id ? " is-dragging" : ""}`}
                    draggable={!menuOpenForTask}
                    onDragStart={(e) => {
                      setDraggedTaskId(task.id);
                      e.dataTransfer.effectAllowed = "move";
                      try {
                        e.dataTransfer.setData("text/plain", task.id);
                      } catch {
                        // 某些浏览器要求 setData 里有实际内容，空安全处理
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setDropTargetCol(null);
                    }}
                    onMouseEnter={() => setHoveredTaskId(task.id)}
                    onMouseLeave={() => setHoveredTaskId(null)}
                  >
                    <Link
                      href={`/task/${task.id}?cwd=${encodeURIComponent(cwd)}`}
                      draggable={false}
                      className={`case-task-card${isNew ? " is-new" : ""}${hoveredTaskId === task.id ? " is-hovered" : ""}`}
                    >
                      <div className="case-task-card-title">{task.title}</div>
                      {task.detail && <div className="case-task-detail">{task.detail}</div>}
                      <div className="case-task-card-meta">
                        <span>{task.assignee}</span>
                        <span className="case-task-signals">
                          {isRunning && <span className="case-pulse">执行中</span>}
                          {task.deadline && (
                            <span className={overdue ? "case-task-card-deadline is-overdue" : "case-task-card-deadline"}>
                              {formatDeadline(task.deadline)}
                            </span>
                          )}
                        </span>
                      </div>
                    </Link>
                    {status === "待验收" && (
                      <div style={{ display: "flex", gap: 6, padding: "8px 14px 4px" }}>
                        <button
                          type="button"
                          onClick={() => patchTask(task.id, { status: "完成" })}
                          style={{ ...MICRO, padding: "4px 10px", border: "1px solid var(--text)", borderRadius: 2, background: "var(--text)", color: "var(--bg)", cursor: "pointer" }}
                        >
                          {tr("验收通过", "Accept")}
                        </button>
                        <button
                          type="button"
                          onClick={() => patchTask(task.id, { status: "进行中" })}
                          style={{ ...MICRO, padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 2, background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}
                        >
                          {tr("继续处理", "Revise")}
                        </button>
                      </div>
                    )}
                    <DotsButton
                      visible={hoveredTaskId === task.id || menuOpenForTask}
                      onClick={() => toggleTaskMenu(task.id)}
                    />
                    {menuOpenForTask && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          top: 28,
                          right: 0,
                          width: 240,
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 2,
                          zIndex: 30,
                          padding: "6px 0",
                          maxHeight: 300,
                          overflowY: "auto",
                          opacity: taskMenuShown ? 1 : 0,
                          transition: "opacity .15s",
                        }}
                      >
                        <div style={{ ...MICRO, color: "var(--text-dim)", padding: "4px 12px" }}>状态</div>
                        {COLUMNS.map((s) => (
                          <MenuRow
                            key={s}
                            micro
                            disabled={task.status === s}
                            onClick={() => patchTask(task.id, { status: s })}
                          >
                            {s}
                          </MenuRow>
                        ))}
                        <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                        <div style={{ ...MICRO, color: "var(--text-dim)", padding: "4px 12px" }}>改派到</div>
                        <div style={{ padding: "2px 12px 6px" }}>
                          <input
                            autoFocus={reassignCases.total > 8}
                            value={caseQuery}
                            placeholder={tr("搜索案件…", "Search cases…")}
                            onChange={(e) => setCaseQuery(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              border: "1px solid var(--border)",
                              borderRadius: 2,
                              padding: "5px 8px",
                              fontSize: 12,
                              background: "var(--bg)",
                              color: "var(--text)",
                              outline: "none",
                            }}
                          />
                        </div>
                        <div style={{ maxHeight: 240, overflowY: "auto" }}>
                          {reassignCases.query && reassignCases.filtered.length === 0 && (
                            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 12px" }}>
                              {tr("无匹配案件", "No matching cases")}
                            </div>
                          )}
                          {reassignCases.filtered.map((c) => (
                            <MenuRow key={c.id} onClick={() => patchTask(task.id, { caseId: c.id })}>
                              {c.title}
                            </MenuRow>
                          ))}
                          {reassignCases.inbox.map((c) => (
                            <MenuRow key={c.id} onClick={() => patchTask(task.id, { caseId: c.id })}>
                              {c.title}
                            </MenuRow>
                          ))}
                        </div>
                        <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                        <MenuRow micro disabled={!isRunning} onClick={() => abortTask(task)}>
                          中断执行
                        </MenuRow>
                        {confirmingDelete ? (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "7px 12px",
                            }}
                          >
                            <span style={{ ...MICRO, letterSpacing: "0.06em", color: "var(--accent)" }}>
                              确认删除？
                            </span>
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <TinyButton accent onClick={() => deleteTask(task)}>
                                删除
                              </TinyButton>
                              <TinyButton onClick={() => setConfirmingDelete(false)}>
                                取消
                              </TinyButton>
                            </span>
                          </div>
                        ) : (
                          <MenuRow micro onClick={() => setConfirmingDelete(true)}>
                            <span style={{ color: "var(--accent)" }}>{tr("删除任务", "Delete task")}</span>
                          </MenuRow>
                        )}
                        {taskMenuError && (
                          <div style={{ fontSize: 11, color: "var(--accent)", padding: "6px 12px 4px" }}>
                            {taskMenuError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      </>
          )}
          {dashboardView === "timeline" && <CaseTimeline events={timelineEvents} />}
          {dashboardView === "documents" && (
            <>
              <CaseDocumentSummary
                deliverables={deliverables ?? []}
                onAdvance={advanceDeliverable}
                advancingId={advancingId}
                error={deliverableError}
              />
              {documents.length > 0 && (
                <section className="case-materials-section">
                  <h2 className="case-list-header">最近材料</h2>
                  <div className="case-dossier-list">
                    {documents.slice(0, 8).map((document) => (
                      <a
                        key={document.path}
                        href={`/api/files/${document.path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}?type=read`}
                        target="_blank"
                        rel="noreferrer"
                        className="case-document-row"
                      >
                        <span className="case-document-row-title">{document.relPath}</span>
                        <span className="case-document-row-meta">{formatDeadline(document.mtime)}</span>
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <aside className="case-workgrid-rail">
          <section className="case-rail-section">
            <CaseRiskSummary risks={caseRisks} />
          </section>
          <section className="case-rail-section" aria-label="案件概览">
            <h2 className="case-list-header">案件脉搏</h2>
            <dl className="case-pulse-list">
              {[
                ["进行中", inProgressCount],
                ["近期事项", upcomingCount],
                ["未归档交付", openDeliverableCount],
              ].map(([label, value]) => (
                <div key={label as string} className="case-pulse-row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>

      {/* 工作流预览模态 */}
      {preview && (
        <div
          onClick={closePreview}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(0,0,0,0.18)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              border: "1px solid var(--border)",
              borderRadius: 2,
              background: "var(--bg)",
              boxShadow: "var(--overlay-shadow)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{preview.workflow.name}</div>
              <div style={{ ...MICRO, color: "var(--text-dim)", marginTop: 5 }}>
                {preview.tasks
                  ? `将为「${currentCase.title}」创建 ${preview.tasks.length} 项任务`
                  : "加载中…"}
              </div>
            </div>
            <div style={{ padding: "6px 16px", maxHeight: "50vh", overflowY: "auto" }}>
              {preview.tasks?.map((task, index) => (
                <div
                  key={task.id ?? index}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 14,
                    padding: "9px 0",
                    borderBottom:
                      index < (preview.tasks?.length ?? 0) - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    <span
                      style={{
                        color: "var(--text-dim)",
                        fontSize: 11,
                        fontVariantNumeric: "tabular-nums",
                        marginRight: 10,
                      }}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {task.title}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                    {task.assignee}
                    {task.priority ? ` · ${PRIORITY_LABEL[task.priority]}` : ""}
                    {task.deadline ? ` · ${formatDeadline(task.deadline)}` : ""}
                  </span>
                </div>
              ))}
            </div>
            {previewError && (
              <div style={{ fontSize: 11, color: "var(--accent)", padding: "4px 16px 0" }}>
                {previewError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: "12px 16px 14px",
              }}
            >
              <ModalButton variant="outline" onClick={closePreview}>
                取消
              </ModalButton>
              <ModalButton
                variant="accent"
                disabled={!preview.tasks || starting}
                onClick={startWorkflowRun}
              >
                {starting ? "启动中…" : "确认启动"}
              </ModalButton>
            </div>
          </div>
        </div>
      )}
    </main>,
  );
}
