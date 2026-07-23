"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Case, Task, TaskStatus } from "@/lib/mju-models";
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

export function CaseBoardView({ caseId }: { caseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cwd = searchParams.get("cwd") ?? "";
  const newTaskId = searchParams.get("new");

  const [cases, setCases] = useState<Case[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!cwd) {
      setError("missing cwd");
      return;
    }
    setError(null);
    Promise.all([loadCases(), loadTasks()]).catch(() => setError("load failed"));
  }, [cwd, loadCases, loadTasks]);

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
        <a href="/board" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          返回 Board
        </a>
      </div>,
    );
  }

  return shell(
    <main style={{ flex: 1, overflowY: "auto", padding: 28 }}>
      {/* Masthead：案件切换 + 类型/阶段 */}
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
        <span style={{ ...MICRO, color: "var(--text-dim)" }}>
          {CASE_TYPE_LABEL[currentCase.type]} · {currentCase.stage}
        </span>
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
                return (
                  <a
                    key={task.id}
                    href={`/task/${task.id}?cwd=${encodeURIComponent(cwd)}`}
                    onMouseEnter={() => setHoveredTaskId(task.id)}
                    onMouseLeave={() => setHoveredTaskId(null)}
                    style={{
                      display: "block",
                      border: "1px solid var(--border)",
                      borderColor: hoveredTaskId === task.id ? "var(--text)" : "var(--border)",
                      borderRadius: 2,
                      padding: "12px 14px",
                      marginTop: 10,
                      background: "var(--bg)",
                      color: "var(--text)",
                      textDecoration: "none",
                      transition: "border-color .12s",
                      ...(isNew
                        ? {
                            borderLeft: "3px solid var(--accent)",
                            animation: "mju-card-in .55s cubic-bezier(.16,1,.3,1) both",
                          }
                        : {}),
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{task.title}</div>
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
                  </a>
                );
              })}
            </section>
          );
        })}
      </div>
    </main>,
  );
}
