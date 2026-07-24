"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Case, Deliverable, DeliverableStatus, DeliverableType, Task, TaskPriority, TaskStatus } from "@/lib/mju-models";
import type { WorkflowDefinition } from "@/lib/workflows";
import { AppNav } from "./AppNav";

const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const COLUMNS: Array<Exclude<TaskStatus, "取消">> = ["待办", "进行中", "完成"];

const CASE_TYPE_LABEL: Record<Case["type"], string> = {
  litigation: "诉讼",
  advisory: "顾问",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const DELIVERABLE_TYPE_LABEL: Record<DeliverableType, string> = {
  "internal-opinion": "内部意见",
  "external-opinion": "对外意见",
  "docx-revision": "修订稿",
  pleading: "诉讼文书",
  "evidence-list": "证据清单",
  "trial-outline": "庭审提纲",
  "research-report": "检索报告",
  other: "其他",
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

function deliverableStatusColor(status: DeliverableStatus): string {
  switch (status) {
    case "internal-review":
      return "var(--text-muted)";
    case "client-review":
      return "var(--text)";
    case "final":
      return "var(--accent)";
    default: // draft / archived
      return "var(--text-dim)";
  }
}

type WorkflowSummary = WorkflowDefinition & { started: boolean };

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
  children,
}: {
  onClick: () => void;
  accent?: boolean;
  children: React.ReactNode;
}) {
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
        letterSpacing: "0.06em",
        padding: "3px 8px",
        borderRadius: 2,
        border: accent ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: accent
          ? hover
            ? "var(--accent-hover)"
            : "var(--accent)"
          : hover
            ? "var(--bg-hover)"
            : "transparent",
        color: accent ? "#ffffff" : "var(--text-muted)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function CaseBoardView({ caseId }: { caseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cwd = searchParams.get("cwd") ?? "";
  const newTaskId = searchParams.get("new");

  const [cases, setCases] = useState<Case[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[] | null>(null);
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
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wfMenuRef = useRef<HTMLDivElement | null>(null);
  const taskMenuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!cwd) {
      setError("missing cwd");
      return;
    }
    setError(null);
    Promise.all([loadCases(), loadTasks(), loadWorkflows(), loadDeliverables()]).catch(() =>
      setError("load failed"),
    );
  }, [cwd, loadCases, loadTasks, loadWorkflows, loadDeliverables]);

  const currentCase = useMemo(
    () => cases?.find((c) => c.id === caseId) ?? null,
    [cases, caseId],
  );

  const caseTasks = useMemo(
    () => (tasks ?? []).filter((t) => t.caseId === caseId && t.status !== "取消"),
    [tasks, caseId],
  );

  const taskCountByCase = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks ?? []) {
      if (task.status === "取消") continue;
      counts.set(task.caseId, (counts.get(task.caseId) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

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

  // 菜单挂载后下一帧淡入（opacity transition）
  useEffect(() => {
    if (!openTaskMenuId) {
      setTaskMenuShown(false);
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

  if (error) return shell(<CenteredNote text="加载失败" />);
  if (!cases || !tasks) return shell(<CenteredNote text="加载中…" />);
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
        <span style={{ ...MICRO, color: "var(--text-dim)" }}>案件不存在</span>
        <Link href="/board" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          返回 Board
        </Link>
      </div>,
    );
  }

  return shell(
    <main style={{ flex: 1, overflowY: "auto", padding: 28 }}>
      {/* Masthead：案件切换 + 工作流启动器 + 类型/阶段 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 22,
        }}
      >
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--text)",
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
              {currentCase.title}
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>▾</span>
          </button>
          {menuOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 8,
                width: 320,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 2,
                zIndex: 30,
              }}
            >
              {(cases ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push(`/board/${c.id}?cwd=${encodeURIComponent(cwd)}`);
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    width: "100%",
                    padding: "10px 14px",
                    border: "none",
                    background: c.id === caseId ? "var(--bg-panel)" : "transparent",
                    cursor: "pointer",
                    color: "var(--text)",
                    fontSize: 13,
                    textAlign: "left",
                  }}
                >
                  <span>{c.title}</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {taskCountByCase.get(c.id) ?? 0} 任务
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          {workflows && workflows.length > 0 && (
            <div ref={wfMenuRef} style={{ position: "relative" }}>
              <TextButton onClick={() => setWfMenuOpen((open) => !open)}>启动工作流 ▾</TextButton>
              {wfMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: 8,
                    width: 240,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 2,
                    zIndex: 30,
                    padding: "4px 0",
                  }}
                >
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
                            已启动
                          </span>
                        )}
                      </span>
                    </MenuRow>
                  ))}
                </div>
              )}
            </div>
          )}
          <span style={{ ...MICRO, color: "var(--text-dim)" }}>
            {CASE_TYPE_LABEL[currentCase.type]} · {currentCase.stage}
          </span>
        </div>
      </div>

      {/* 三列看板 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {COLUMNS.map((status) => {
          const columnTasks = caseTasks.filter((t) => t.status === status);
          return (
            <section key={status}>
              <h2
                style={{
                  ...MICRO,
                  color: "var(--text-dim)",
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  margin: 0,
                }}
              >
                <span>{status}</span>
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
                    style={{ position: "relative", marginTop: 10 }}
                    onMouseEnter={() => setHoveredTaskId(task.id)}
                    onMouseLeave={() => setHoveredTaskId(null)}
                  >
                    <Link
                      href={`/task/${task.id}?cwd=${encodeURIComponent(cwd)}`}
                      style={{
                        display: "block",
                        border: "1px solid var(--border)",
                        borderColor: hoveredTaskId === task.id ? "var(--text)" : "var(--border)",
                        borderRadius: 2,
                        padding: "12px 14px",
                        background: "var(--bg)",
                        color: "var(--text)",
                        textDecoration: "none",
                        transition: "border-color .12s",
                        ...(isNew
                          ? {
                              // inset box-shadow instead of borderLeft: mixing border
                              // shorthand with border-left longhand trips React's
                              // style-conflict warning on rerender.
                              boxShadow: "inset 3px 0 0 var(--accent)",
                              animation: "mju-card-in .55s cubic-bezier(.16,1,.3,1) both",
                            }
                          : {}),
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, paddingRight: 20 }}>{task.title}</div>
                      <div
                        style={{
                          color: "var(--text-dim)",
                          fontSize: 11,
                          marginTop: 5,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>{task.assignee}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {isRunning && (
                            <>
                              <span
                                style={{
                                  display: "inline-block",
                                  width: 6,
                                  height: 6,
                                  background: "var(--accent)",
                                  animation: "pulse 1.2s infinite",
                                }}
                              />
                              <span style={{ ...MICRO, letterSpacing: "0.06em", color: "var(--accent)" }}>
                                执行中
                              </span>
                            </>
                          )}
                          {task.deadline && (
                            <span style={{ color: overdue ? "var(--accent)" : undefined }}>
                              {formatDeadline(task.deadline)}
                            </span>
                          )}
                        </span>
                      </div>
                    </Link>
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
                          width: 200,
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
                        {(cases ?? [])
                          .filter((c) => c.id !== caseId)
                          .map((c) => (
                            <MenuRow key={c.id} onClick={() => patchTask(task.id, { caseId: c.id })}>
                              {c.title}
                            </MenuRow>
                          ))}
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
                            <span style={{ color: "var(--accent)" }}>删除任务</span>
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

      {/* 交付物 */}
      {deliverables && deliverables.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2
            style={{
              ...MICRO,
              color: "var(--text-dim)",
              paddingBottom: 8,
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              margin: 0,
            }}
          >
            <span>交付物</span>
            <span>{deliverables.length}</span>
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {deliverables.map((d) => {
              const archived = d.status === "archived";
              const busy = advancingId === d.id;
              return (
                <div
                  key={d.id}
                  style={{
                    width: 220,
                    border: "1px solid var(--border)",
                    borderRadius: 2,
                    padding: "10px 12px",
                    background: "var(--bg)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {d.title}
                  </div>
                  <div style={{ ...MICRO, letterSpacing: "0.06em", color: "var(--text-dim)", marginTop: 4 }}>
                    {DELIVERABLE_TYPE_LABEL[d.type] ?? d.type} · v{d.version}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      disabled={archived || busy}
                      title={archived ? "已归档" : "点击推进状态"}
                      onClick={() => advanceDeliverable(d)}
                      style={{
                        ...MICRO,
                        border: `1px solid ${deliverableStatusColor(d.status)}`,
                        borderRadius: 2,
                        padding: "2px 6px",
                        background: "transparent",
                        color: deliverableStatusColor(d.status),
                        textDecoration: archived ? "line-through" : "none",
                        cursor: archived || busy ? "default" : "pointer",
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      {DELIVERABLE_STATUS_LABEL[d.status]}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {deliverableError && (
            <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 8 }}>{deliverableError}</div>
          )}
        </section>
      )}

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
              boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
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
