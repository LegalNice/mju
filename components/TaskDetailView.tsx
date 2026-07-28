"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Case, Deliverable, DeliverableStatus, Task, TaskStatus } from "@/lib/mju-models";
import type { SessionInfo, SessionTreeNode } from "@/lib/types";
import type { CaseDocEntry } from "@/app/api/casedocs/route";
import { encodeFilePathForApi, getFileName } from "@/lib/file-paths";
import { sendAgentCommand } from "@/lib/agent-client";
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { AppNav } from "./AppNav";
import { MarkdownBody } from "./MarkdownBody";
import { ChatWindow } from "./ChatWindow";
import { BranchNavigator } from "./BranchNavigator";

const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const MONO: CSSProperties = {
  fontFamily: "var(--font-mono)",
};

interface FileReadResponse {
  content: string;
  language: string;
  size: number;
}

interface SessionInfoResponse {
  info?: { cwd?: string } | null;
}

function todayString(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" → "M-D"（同 CaseBoardView） */
function formatDeadline(deadline: string): string {
  const parts = deadline.slice(0, 10).split("-");
  if (parts.length < 3) return deadline;
  return `${Number(parts[1])}-${Number(parts[2])}`;
}

/** ISO 时间 → "M-D HH:mm" */
function formatMtime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}-${d.getDate()} ${hh}:${mm}`;
}

function treeHasBranch(nodes: SessionTreeNode[]): boolean {
  return nodes.some((n) => n.children.length > 1 || treeHasBranch(n.children));
}

const STATUS_OPTIONS: TaskStatus[] = ["待办", "进行中", "完成"];

const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  draft: "草稿",
  "internal-review": "内审",
  "client-review": "客户审",
  final: "定稿",
  archived: "归档",
};

const DELIVERABLE_STATUS_COLOR: Record<DeliverableStatus, string> = {
  draft: "var(--text-dim)",
  "internal-review": "var(--text-muted)",
  "client-review": "var(--text)",
  final: "var(--accent)",
  archived: "var(--text-dim)",
};

const MENU_STYLE: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: 6,
  minWidth: 140,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 2,
  zIndex: 40,
  padding: "4px 0",
};

const MENU_ITEM_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "7px 12px",
  border: "none",
  background: "transparent",
  color: "var(--text)",
  fontSize: 12,
  textAlign: "left",
  cursor: "pointer",
};

function PulseSquare() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        background: "var(--accent)",
        animation: "pulse 1.2s infinite",
        flexShrink: 0,
      }}
    />
  );
}

function ErrorLine({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 12 }}>{text}</div>;
}

function CenteredNote({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ ...MICRO, color: accent ? "var(--accent)" : "var(--text-dim)" }}>{text}</span>
    </div>
  );
}

export function TaskDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cwd = searchParams.get("cwd") ?? "";

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [cases, setCases] = useState<Case[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // ChatWindow 需要合成 SessionInfo，其中 cwd 必须真实（@ 文件引用、消息内链接解析都依赖它）
  const [sessionCwd, setSessionCwd] = useState<string | null>(null);
  const [sessionInfoError, setSessionInfoError] = useState<string | null>(null);

  const [docs, setDocs] = useState<CaseDocEntry[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [docContentError, setDocContentError] = useState<string | null>(null);

  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(new Set());

  // 任务关联的交付物
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);

  // 分支导航：数据由 ChatWindow 经 onBranchDataChange 流出（同 AppShell）
  const [branchTree, setBranchTree] = useState<SessionTreeNode[]>([]);
  const [branchActiveLeafId, setBranchActiveLeafId] = useState<string | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const branchLeafChangeFnRef = useRef<((leafId: string | null) => void) | null>(null);
  const branchBarRef = useRef<HTMLDivElement | null>(null);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [forkError, setForkError] = useState<string | null>(null);

  // meta 行菜单：状态切换 / 改派案件
  const [metaMenu, setMetaMenu] = useState<"status" | "reassign" | null>(null);
  const [metaMenuError, setMetaMenuError] = useState<string | null>(null);
  const [metaBusy, setMetaBusy] = useState(false);
  const metaMenuRef = useRef<HTMLDivElement | null>(null);

  // 中断 / 删除
  const [aborting, setAborting] = useState(false);
  const [abortError, setAbortError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 文档导出 DOCX
  const [templates, setTemplates] = useState<string[]>([]);
  const [exportingPath, setExportingPath] = useState<string | null>(null);
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  const [exportErrors, setExportErrors] = useState<Record<string, string>>({});
  const [exportedDeliverables, setExportedDeliverables] = useState<Record<string, string>>({});
  const [templatePickerFor, setTemplatePickerFor] = useState<string | null>(null);
  const [hoveredDocPath, setHoveredDocPath] = useState<string | null>(null);
  const templatePickerRef = useRef<HTMLDivElement | null>(null);

  // 左栏宽度（可拖拽，localStorage 持久化）
  const [leftWidth, setLeftWidth] = useState(400);
  const [resizing, setResizing] = useState(false);
  const [handleHover, setHandleHover] = useState(false);
  const resizingRef = useRef(false);

  // 改派菜单搜索
  const [reassignQuery, setReassignQuery] = useState("");

  const selectedPathRef = useRef<string | null>(null);
  selectedPathRef.current = selectedPath;

  // Esc 中止运行中的 agent（ChatWindow 自己注册 abort handler，这里只挂全局监听）
  useGlobalKeyboardShortcuts({});

  // ---------- 任务 / 案件 ----------

  useEffect(() => {
    if (!cwd) {
      setLoadFailed(true);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch(`/api/tasks?cwd=${encodeURIComponent(cwd)}`).then(async (res) => {
        if (!res.ok) throw new Error(`tasks ${res.status}`);
        return ((await res.json()) as { tasks: Task[] }).tasks;
      }),
      fetch(`/api/cases?cwd=${encodeURIComponent(cwd)}`).then(async (res) => {
        if (!res.ok) throw new Error(`cases ${res.status}`);
        return ((await res.json()) as { cases: Case[] }).cases;
      }),
    ])
      .then(([taskList, caseList]) => {
        if (cancelled) return;
        setTasks(taskList);
        setCases(caseList);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const task = useMemo(() => tasks?.find((t) => t.id === taskId) ?? null, [tasks, taskId]);
  const currentCase = useMemo(
    () => (task && cases ? cases.find((c) => c.id === task.caseId) ?? null : null),
    [task, cases],
  );
  const sessionId = task?.sessionId ?? null;

  // 本地回写 task.sessionId（fork / 启动会话后调用，key 变化触发 ChatWindow 重挂载）
  const bindSession = useCallback(
    async (newSessionId: string): Promise<boolean> => {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, id: taskId, sessionId: newSessionId }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { task?: Task };
      setTasks((prev) =>
        prev?.map((t) => (t.id === taskId ? data.task ?? { ...t, sessionId: newSessionId } : t)) ?? prev,
      );
      return true;
    },
    [cwd, taskId],
  );

  // 通用任务 PATCH：更新本地 task 状态显示（Board 靠自己轮询刷新）
  const patchTask = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, id: taskId, ...body }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { task?: Task };
      if (data.task) {
        const next = data.task;
        setTasks((prev) => prev?.map((t) => (t.id === taskId ? next : t)) ?? prev);
      }
      return true;
    },
    [cwd, taskId],
  );

  const handleStatusSelect = useCallback(
    (status: TaskStatus) => {
      if (!task || status === task.status || metaBusy) return;
      setMetaBusy(true);
      setMetaMenuError(null);
      void patchTask({ status }).then((ok) => {
        setMetaBusy(false);
        if (ok) setMetaMenu(null);
        else setMetaMenuError("状态更新失败");
      });
    },
    [task, metaBusy, patchTask],
  );

  const handleReassignSelect = useCallback(
    (nextCaseId: string) => {
      if (!task || nextCaseId === task.caseId || metaBusy) return;
      setMetaBusy(true);
      setMetaMenuError(null);
      void patchTask({ caseId: nextCaseId }).then((ok) => {
        setMetaBusy(false);
        if (!ok) {
          setMetaMenuError("改派失败");
          return;
        }
        setMetaMenu(null);
        // 右栏文档属于旧案件：立即清掉，caseId 变化会触发重新拉取
        setDocs(null);
        setSelectedPath(null);
        setDocContent(null);
      });
    },
    [task, metaBusy, patchTask],
  );

  // 点击 meta 菜单外部时收起
  useEffect(() => {
    if (!metaMenu) return;
    const onDown = (e: MouseEvent) => {
      if (metaMenuRef.current && !metaMenuRef.current.contains(e.target as Node)) {
        setMetaMenu(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [metaMenu]);

  // ---------- 会话 cwd（合成 SessionInfo 用） ----------

  useEffect(() => {
    if (!sessionId) {
      setSessionCwd(null);
      setSessionInfoError(null);
      return;
    }
    let cancelled = false;
    setSessionCwd(null);
    setSessionInfoError(null);
    const params = new URLSearchParams({ deferThinking: "1", deferMedia: "1" });
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`sessions ${res.status}`);
        return (await res.json()) as SessionInfoResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setSessionCwd(data.info?.cwd ?? cwd);
      })
      .catch((e) => {
        if (!cancelled) setSessionInfoError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, cwd]);

  const sessionInfo = useMemo<SessionInfo | null>(() => {
    if (!sessionId || !sessionCwd) return null;
    return {
      id: sessionId,
      cwd: sessionCwd,
      path: "",
      created: "",
      modified: "",
      messageCount: 0,
      firstMessage: "",
    };
  }, [sessionId, sessionCwd]);

  // ---------- 运行状态（running SSE 是唯一来源，右栏轮询以此为开关） ----------

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

  const isRunning = Boolean(sessionId && runningSessionIds.has(sessionId));

  // ---------- 中断 / 删除 ----------

  const handleAbort = useCallback(() => {
    if (!sessionId || aborting) return;
    setAborting(true);
    setAbortError(null);
    sendAgentCommand(sessionId, { type: "abort" })
      .then(() => setAborting(false))
      .catch((e) => {
        setAborting(false);
        setAbortError(e instanceof Error ? e.message : String(e));
      });
  }, [sessionId, aborting]);

  const disarmDelete = useCallback(() => {
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    setDeleteArmed(false);
  }, []);

  // 卸载时清掉确认倒计时
  useEffect(() => disarmDelete, [disarmDelete]);

  const handleDelete = useCallback(() => {
    if (deleting) return;
    // 两步确认：第一次点击进入确认态，3 秒未确认自动还原
    if (!deleteArmed) {
      setDeleteError(null);
      setDeleteArmed(true);
      deleteTimerRef.current = setTimeout(() => {
        deleteTimerRef.current = null;
        setDeleteArmed(false);
      }, 3000);
      return;
    }
    disarmDelete();
    setDeleting(true);
    setDeleteError(null);
    void (async () => {
      try {
        // 运行中先中断（失败也继续删除）；无 sessionId 直接跳过
        if (sessionId && isRunning) {
          await sendAgentCommand(sessionId, { type: "abort" }).catch(() => {});
        }
        const res = await fetch(
          `/api/tasks?cwd=${encodeURIComponent(cwd)}&id=${encodeURIComponent(taskId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error(`delete ${res.status}`);
        router.push(`/board/${task?.caseId ?? ""}?cwd=${encodeURIComponent(cwd)}`);
      } catch (e) {
        setDeleting(false);
        setDeleteError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [deleting, deleteArmed, disarmDelete, sessionId, isRunning, cwd, taskId, router, task?.caseId]);

  // ---------- 分支导航回调 ----------

  const handleBranchDataChange = useCallback(
    (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => {
      setBranchTree(tree);
      setBranchActiveLeafId(activeLeafId);
      branchLeafChangeFnRef.current = onLeafChange;
    },
    [],
  );

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    branchLeafChangeFnRef.current?.(leafId);
  }, []);

  const showBranchBar = branchTree.length > 0 && treeHasBranch(branchTree);

  // 点击分支条外部时收起下拉
  useEffect(() => {
    if (!branchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (branchBarRef.current && !branchBarRef.current.contains(e.target as Node)) {
        setBranchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [branchOpen]);

  // ---------- fork 回写 / 启动会话 ----------

  const handleForked = useCallback(
    (newSessionId: string) => {
      void bindSession(newSessionId).then((ok) => {
        setForkError(ok ? null : "fork 后回写任务失败");
      });
    },
    [bindSession],
  );

  const handleStartSession = useCallback(async () => {
    if (!currentCase || !task || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      // Send the task instruction as the first prompt instead of ensure_session.
      // pi only persists a session file once the first assistant message exists,
      // so ensure_session produced a phantom sessionId with no .jsonl behind it —
      // the chat then loaded a 404 forever and looked unresponsive.
      const instruction = task.originPrompt || task.detail || task.title;
      const res = await fetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: currentCase.vaultPath, type: "prompt", message: instruction }),
      });
      if (!res.ok) throw new Error(`agent/new ${res.status}`);
      const data = (await res.json()) as { sessionId?: string };
      if (!data.sessionId) throw new Error("no sessionId");
      const bound = await bindSession(data.sessionId);
      if (!bound) throw new Error("bind failed");
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }, [currentCase, task, starting, bindSession]);

  // 聊天中点击文件链接：若是案件文档则切到右栏预览，否则忽略
  const handleOpenFile = useCallback(
    (filePath: string) => {
      if (docs?.some((d) => d.path === filePath)) setSelectedPath(filePath);
    },
    [docs],
  );

  // ---------- 案件文档（右栏） ----------

  const caseId = task?.caseId ?? null;

  const loadDocs = useCallback(async () => {
    if (!cwd || !caseId) return;
    const res = await fetch(
      `/api/casedocs?cwd=${encodeURIComponent(cwd)}&caseId=${encodeURIComponent(caseId)}`,
    );
    if (!res.ok) throw new Error(`casedocs ${res.status}`);
    const data = (await res.json()) as { docs: CaseDocEntry[] };
    setDocs(data.docs);
    setDocsError(null);
    setSelectedPath((prev) =>
      prev && data.docs.some((d) => d.path === prev) ? prev : data.docs[0]?.path ?? null,
    );
  }, [cwd, caseId]);

  const loadDocContent = useCallback(async (path: string) => {
    const res = await fetch(`/api/files/${encodeFilePathForApi(path)}?type=read`);
    if (!res.ok) throw new Error(`files ${res.status}`);
    const data = (await res.json()) as FileReadResponse;
    setDocContent(data.content);
    setDocContentError(null);
  }, []);

  useEffect(() => {
    if (!caseId) return;
    loadDocs().catch((e) => setDocsError(String(e)));
  }, [caseId, loadDocs]);

  // ---------- 交付物 ----------

  const loadDeliverables = useCallback(async () => {
    if (!cwd) return;
    const res = await fetch(
      `/api/deliverables?cwd=${encodeURIComponent(cwd)}&taskId=${encodeURIComponent(taskId)}`,
    );
    if (!res.ok) throw new Error(`deliverables ${res.status}`);
    const data = (await res.json()) as { deliverables: Deliverable[] };
    setDeliverables(data.deliverables ?? []);
  }, [cwd, taskId]);

  useEffect(() => {
    loadDeliverables().catch(() => {});
  }, [loadDeliverables]);

  useEffect(() => {
    if (!selectedPath) {
      setDocContent(null);
      return;
    }
    setDocContentError(null);
    loadDocContent(selectedPath).catch((e) => setDocContentError(String(e)));
  }, [selectedPath, loadDocContent]);

  // 运行中每 3s 轮询文档列表和当前预览，让用户看着 agent 写文件
  useEffect(() => {
    if (!isRunning || !caseId) return;
    const tick = () => {
      loadDocs().catch(() => {});
      const path = selectedPathRef.current;
      if (path) loadDocContent(path).catch(() => {});
    };
    const timer = setInterval(tick, 3000);
    return () => clearInterval(timer);
  }, [isRunning, caseId, loadDocs, loadDocContent]);

  // 运行结束后再做一次最终刷新
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (prevRunningRef.current && !isRunning && caseId) {
      loadDocs().catch(() => {});
      const path = selectedPathRef.current;
      if (path) loadDocContent(path).catch(() => {});
    }
    prevRunningRef.current = isRunning;
  }, [isRunning, caseId, loadDocs, loadDocContent]);

  // ---------- 文档导出 DOCX ----------

  // 挂载时拉一次模板列表（可能为空）
  useEffect(() => {
    if (!cwd) return;
    let cancelled = false;
    fetch(`/api/deliverables/generate?cwd=${encodeURIComponent(cwd)}`)
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((data: { templates?: string[] }) => {
        if (!cancelled) setTemplates(data.templates ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  // 点击模板浮层外部时收起
  useEffect(() => {
    if (!templatePickerFor) return;
    const onDown = (e: MouseEvent) => {
      if (templatePickerRef.current && !templatePickerRef.current.contains(e.target as Node)) {
        setTemplatePickerFor(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [templatePickerFor]);

  const handleGenerate = useCallback(
    async (sourcePath: string, templateName?: string) => {
      if (exportingPath || !caseId) return;
      setTemplatePickerFor(null);
      setExportingPath(sourcePath);
      setExportErrors((prev) => {
        const next = { ...prev };
        delete next[sourcePath];
        return next;
      });
      try {
        const res = await fetch("/api/deliverables/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cwd,
            caseId,
            sourcePath,
            taskId,
            ...(templateName ? { templateName } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          deliverable?: { filePath?: string };
          error?: string;
        };
        if (!res.ok || data.error) throw new Error(data.error ?? `generate ${res.status}`);
        if (data.deliverable?.filePath) {
          const filePath = data.deliverable.filePath;
          setExportedDeliverables((prev) => ({ ...prev, [sourcePath]: filePath }));
        }
        setExportedPath(sourcePath);
        setTimeout(() => setExportedPath((p) => (p === sourcePath ? null : p)), 2500);
        // 新交付物立即出现在 meta 下方
        void loadDeliverables().catch(() => {});
      } catch (e) {
        setExportErrors((prev) => ({
          ...prev,
          [sourcePath]: e instanceof Error ? e.message : String(e),
        }));
      } finally {
        setExportingPath(null);
      }
    },
    [exportingPath, caseId, cwd, taskId, loadDeliverables],
  );

  const handleDocxClick = useCallback(
    (sourcePath: string) => {
      if (exportingPath) return;
      if (templates.length > 0) {
        setTemplatePickerFor((p) => (p === sourcePath ? null : sourcePath));
      } else {
        void handleGenerate(sourcePath);
      }
    },
    [exportingPath, templates, handleGenerate],
  );

  // ---------- 左栏宽度拖拽 ----------

  // 挂载后读 localStorage（SSR 初始 400，避免水合不一致）
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("mju-task-left-width"));
      if (Number.isFinite(saved) && saved >= 320) {
        setLeftWidth(Math.min(Math.max(320, window.innerWidth * 0.6), saved));
      }
    } catch {
      // localStorage 不可用时静默
    }
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    setResizing(true);
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const max = Math.max(320, window.innerWidth * 0.6);
      setLeftWidth(Math.min(max, Math.max(320, ev.clientX)));
    };
    const onUp = () => {
      resizingRef.current = false;
      setResizing(false);
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setLeftWidth((w) => {
        try {
          localStorage.setItem("mju-task-left-width", String(w));
        } catch {
          // localStorage 不可用时静默
        }
        return w;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ---------- 渲染 ----------

  const boardHref = task ? `/board/${task.caseId}?cwd=${encodeURIComponent(cwd)}` : undefined;  const today = todayString();
  const overdue = Boolean(task?.deadline && task.deadline.slice(0, 10) < today && task.status !== "完成");

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

  if (loadFailed) return shell(<CenteredNote text="加载失败" accent />);
  if (!tasks || !cases) return shell(<CenteredNote text="加载中…" />);
  if (!task) {
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
        <span style={{ ...MICRO, color: "var(--text-dim)" }}>任务不存在</span>
        <Link href="/board" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          返回 Board
        </Link>
      </div>,
    );
  }

  const reassignQueryNorm = reassignQuery.trim().toLowerCase();
  // 收件箱（通用任务）恒显示在列表底部且不受过滤
  const reassignInbox = cases.filter((c) => c.id !== task.caseId && c.stage === "收件箱");
  const reassignOthers = cases
    .filter((c) => c.id !== task.caseId && c.stage !== "收件箱")
    .filter((c) => !reassignQueryNorm || c.title.toLowerCase().includes(reassignQueryNorm));
  const reassignItems = [...reassignOthers, ...reassignInbox];

  const header = (
    <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "12px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <Link
          href={boardHref ?? "/board"}
          style={{ ...MICRO, color: "var(--text-muted)", textDecoration: "none" }}
        >
          ← {currentCase?.title ?? "返回看板"}
        </Link>
        <span style={{ display: "flex", alignItems: "baseline", gap: 14, flexShrink: 0 }}>
          {sessionId && isRunning && (
            <button
              type="button"
              onClick={handleAbort}
              disabled={aborting}
              style={{
                ...MICRO,
                padding: 0,
                border: "none",
                background: "transparent",
                color: "var(--accent)",
                cursor: aborting ? "not-allowed" : "pointer",
                opacity: aborting ? 0.4 : 1,
              }}
            >
              {aborting ? "中断中…" : "中断"}
            </button>
          )}
          {sessionId && (
            <a
              href={`/api/sessions/${encodeURIComponent(sessionId)}/export?inline=1`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...MICRO, color: "var(--text-muted)", textDecoration: "none" }}
            >
              导出
            </a>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            style={{
              ...MICRO,
              padding: 0,
              border: "none",
              background: "transparent",
              color: deleteArmed ? "var(--accent)" : "var(--text-muted)",
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.4 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = deleteArmed ? "var(--accent)" : "var(--text-muted)";
            }}
          >
            {deleting ? "删除中…" : deleteArmed ? "确认删除？" : "删除"}
          </button>
        </span>
      </div>
      <div style={{ marginTop: 10, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>
        {task.title}
      </div>
      <div
        ref={metaMenuRef}
        style={{
          ...MICRO,
          color: "var(--text-dim)",
          marginTop: 6,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setMetaMenuError(null);
              setMetaMenu((m) => (m === "status" ? null : "status"));
            }}
            style={{
              ...MICRO,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "var(--text-dim)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-dim)";
            }}
          >
            {task.status} ▾
          </button>
          {metaMenu === "status" && (
            <div style={MENU_STYLE}>
              {STATUS_OPTIONS.map((s) => {
                const current = s === task.status;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={current}
                    onClick={() => handleStatusSelect(s)}
                    style={{
                      ...MENU_ITEM_STYLE,
                      color: current ? "var(--text-dim)" : "var(--text)",
                      cursor: current ? "default" : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!current) e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {s}
                  </button>
                );
              })}
              {metaMenuError && (
                <div style={{ fontSize: 11, color: "var(--accent)", padding: "6px 12px" }}>{metaMenuError}</div>
              )}
            </div>
          )}
        </span>
        <span>{task.assignee}</span>
        {task.deadline && (
          <span style={{ color: overdue ? "var(--accent)" : undefined }}>
            {formatDeadline(task.deadline)}
            {overdue ? " · 已逾期" : ""}
          </span>
        )}
        <span style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setMetaMenuError(null);
              setReassignQuery("");
              setMetaMenu((m) => (m === "reassign" ? null : "reassign"));
            }}
            style={{
              ...MICRO,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            改派 ▾
          </button>
          {metaMenu === "reassign" && (
            <div style={{ ...MENU_STYLE, width: 220, padding: 0 }}>
              <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
                <input
                  autoFocus
                  value={reassignQuery}
                  onChange={(e) => setReassignQuery(e.target.value)}
                  placeholder="搜索案件…"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid var(--border)",
                    borderRadius: 2,
                    padding: "6px 8px",
                    fontSize: 12,
                    background: "transparent",
                    color: "var(--text)",
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto", padding: "4px 0" }}>
                {reassignItems.length === 0 && (
                  <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "7px 12px" }}>
                    {reassignQueryNorm ? "无匹配案件" : "没有其它案件"}
                  </div>
                )}
                {reassignItems.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleReassignSelect(c.id)}
                    style={MENU_ITEM_STYLE}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
              {metaMenuError && (
                <div style={{ fontSize: 11, color: "var(--accent)", padding: "6px 12px" }}>{metaMenuError}</div>
              )}
            </div>
          )}
        </span>
        {isRunning && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)" }}>
            <PulseSquare />
            执行中
          </span>
        )}
      </div>
      {deliverables.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...MICRO, color: "var(--text-dim)" }}>交付物</span>
          {deliverables.map((d) => (
            <span
              key={d.id}
              title={d.filePath}
              style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: 6,
                border: "1px solid var(--border)",
                borderRadius: 2,
                padding: "4px 8px",
                fontSize: 12,
                color: "var(--text)",
              }}
            >
              <span>{d.title || getFileName(d.filePath)}</span>
              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>v{d.version}</span>
              <span
                style={{
                  fontSize: 10,
                  color: DELIVERABLE_STATUS_COLOR[d.status],
                  textDecoration: d.status === "archived" ? "line-through" : undefined,
                }}
              >
                {DELIVERABLE_STATUS_LABEL[d.status]}
              </span>
            </span>
          ))}
        </div>
      )}
      {abortError && <ErrorLine text={abortError} />}
      {deleteError && <ErrorLine text={deleteError} />}
    </div>
  );

  return shell(
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      {/* ============ 左栏：任务信息 + 聊天 ============ */}
      <div
        style={{
          width: leftWidth,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {header}

        {sessionId ? (
          <>
            {showBranchBar && (
              <div
                ref={branchBarRef}
                style={{ flexShrink: 0, height: 32, borderBottom: "1px solid var(--border)" }}
              >
                <BranchNavigator
                  tree={branchTree}
                  activeLeafId={branchActiveLeafId}
                  onLeafChange={handleBranchLeafChange}
                  inline
                  containerRef={branchBarRef}
                  open={branchOpen}
                  onToggle={() => setBranchOpen((v) => !v)}
                  hasSession
                />
              </div>
            )}
            {forkError && <ErrorLine text={forkError} />}
            {sessionInfoError && <ErrorLine text={sessionInfoError} />}
            <div style={{ flex: 1, minHeight: 0 }}>
              {sessionInfo ? (
                <ChatWindow
                  key={sessionId}
                  session={sessionInfo}
                  newSessionCwd={null}
                  onSessionForked={handleForked}
                  onBranchDataChange={handleBranchDataChange}
                  onOpenFile={handleOpenFile}
                />
              ) : (
                !sessionInfoError && (
                  <div style={{ padding: 16 }}>
                    <span style={{ ...MICRO, color: "var(--text-dim)" }}>加载中…</span>
                  </div>
                )
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            <div
              style={{
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderLeft: "3px solid var(--accent)",
                borderRadius: 2,
              }}
            >
              <span style={{ ...MICRO, color: "var(--accent)" }}>指令</span>
              <p style={{ margin: "6px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>
                {task.originPrompt || task.detail}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleStartSession()}
              disabled={starting || !currentCase}
              style={{
                marginTop: 16,
                padding: "8px 16px",
                border: "none",
                borderRadius: 2,
                background: "var(--accent)",
                color: "white",
                cursor: starting || !currentCase ? "not-allowed" : "pointer",
                opacity: starting || !currentCase ? 0.4 : 1,
                ...MICRO,
              }}
            >
              {starting ? "启动中…" : "启动会话"}
            </button>
            {startError && <ErrorLine text={startError} />}
          </div>
        )}
      </div>

      {/* ============ 拖拽把手 ============ */}
      <div
        onMouseDown={handleResizeStart}
        onMouseEnter={() => setHandleHover(true)}
        onMouseLeave={() => setHandleHover(false)}
        style={{ width: 5, flexShrink: 0, cursor: "col-resize", position: "relative" }}
      >
        <div
          style={{
            position: "absolute",
            left: 2,
            top: 0,
            bottom: 0,
            width: 1,
            background: resizing || handleHover ? "var(--accent)" : "transparent",
          }}
        />
      </div>

      {/* ============ 右栏：文档列表 + 预览 ============ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div
          style={{
            flexShrink: 0,
            maxHeight: "38%",
            overflowY: "auto",
            borderBottom: "1px solid var(--border)",
            padding: "12px 16px",
          }}
        >
          <div style={{ ...MICRO, color: "var(--text-dim)" }}>文档</div>
          {docsError && <ErrorLine text={docsError} />}
          {docs && docs.length === 0 && (
            <div style={{ padding: "12px 0", fontSize: 12, color: "var(--text-dim)" }}>
              案件文件夹中还没有 markdown 文档
            </div>
          )}
          {(docs ?? []).map((doc) => {
            const selected = doc.path === selectedPath;
            const dir = doc.relPath !== doc.name ? doc.relPath.slice(0, doc.relPath.length - doc.name.length).replace(/[\\/]$/, "") : "";
            const exporting = exportingPath === doc.path;
            const exported = exportedPath === doc.path;
            const deliverablePath = exportedDeliverables[doc.path];
            const deliverableRel = deliverablePath && currentCase && deliverablePath.startsWith(currentCase.vaultPath + "/")
              ? deliverablePath.slice(currentCase.vaultPath.length + 1)
              : deliverablePath;
            return (
              <div
                key={doc.path}
                style={{ position: "relative", marginTop: 6 }}
                onMouseEnter={() => setHoveredDocPath(doc.path)}
                onMouseLeave={() => setHoveredDocPath(null)}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPath(doc.path)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedPath(doc.path);
                    }
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 12,
                    width: "100%",
                    padding: "7px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 2,
                    background: selected ? "var(--bg-selected)" : "transparent",
                    color: "var(--text)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {doc.name}
                    </span>
                    {dir && (
                      <span style={{ ...MONO, display: "block", fontSize: 10, color: "var(--text-dim)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {dir}
                      </span>
                    )}
                  </span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDocxClick(doc.path);
                      }}
                      disabled={exporting}
                      style={{
                        ...MICRO,
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        color: exported ? "var(--accent)" : "var(--text-muted)",
                        cursor: exporting ? "not-allowed" : "pointer",
                        opacity: hoveredDocPath === doc.path || exporting || exported ? 1 : 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--accent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = exported ? "var(--accent)" : "var(--text-muted)";
                      }}
                    >
                      {exporting ? "导出中…" : exported ? "已导出 ✓" : "DOCX"}
                    </button>
                    <span style={{ ...MONO, fontSize: 10, color: "var(--text-dim)" }}>
                      {formatMtime(doc.mtime)}
                    </span>
                  </span>
                </div>
                {deliverableRel && (
                  <div style={{ ...MONO, fontSize: 10, color: "var(--text-muted)", marginTop: 3, paddingLeft: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    → {deliverableRel}
                  </div>
                )}
                {exportErrors[doc.path] && (
                  <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 3, paddingLeft: 10 }}>
                    {exportErrors[doc.path]}
                  </div>
                )}
                {templatePickerFor === doc.path && (
                  <div
                    ref={templatePickerRef}
                    style={{ ...MENU_STYLE, left: "auto", right: 0, marginTop: 2 }}
                  >
                    {templates.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => void handleGenerate(doc.path, name)}
                        style={MENU_ITEM_STYLE}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void handleGenerate(doc.path)}
                      style={{ ...MENU_ITEM_STYLE, color: "var(--text-muted)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      不使用模板
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", background: "var(--bg-panel)" }}>
          {selectedPath ? (
            <div
              style={{
                maxWidth: 680,
                margin: "0 auto",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 2,
                padding: "40px 44px",
                minHeight: "80%",
              }}
            >
              {docContentError && <ErrorLine text={docContentError} />}
              {docContent === null && !docContentError ? (
                <span style={{ ...MICRO, color: "var(--text-dim)" }}>加载中…</span>
              ) : (
                <MarkdownBody cwd={cwd}>{docContent ?? ""}</MarkdownBody>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40%" }}>
              <span style={{ ...MICRO, color: "var(--text-dim)" }}>
                {docs === null ? "加载中…" : "没有可预览的文档"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>,
  );
}
