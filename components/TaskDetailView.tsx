"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Case, Task } from "@/lib/mju-models";
import type { AgentMessage, AssistantMessage, ToolCallContent, UserMessage } from "@/lib/types";
import type { CaseDocEntry } from "@/app/api/casedocs/route";
import { normalizeToolCalls } from "@/lib/normalize";
import { sendAgentCommand } from "@/lib/agent-client";
import { encodeFilePathForApi } from "@/lib/file-paths";
import { AppNav } from "./AppNav";
import { MarkdownBody } from "./MarkdownBody";

const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const MONO: CSSProperties = {
  fontFamily: "var(--font-mono)",
};

interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

interface SessionResponse {
  context: {
    messages: AgentMessage[];
    entryIds: string[];
  };
}

interface AgentStateResponse {
  running?: boolean;
  state?: {
    isStreaming?: boolean;
    isPromptRunning?: boolean;
  };
}

interface FileReadResponse {
  content: string;
  language: string;
  size: number;
}

type ToolCallLine = { name: string; summary: string };

type TimelineItem =
  | { kind: "user"; text: string; key: string }
  | { kind: "assistant"; text: string; key: string }
  | { kind: "tools"; calls: ToolCallLine[]; key: string };

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

function truncateSingleLine(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function extractMessageText(message: Partial<AgentMessage>): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      block && typeof block === "object" && (block as { type?: string }).type === "text"
        && typeof (block as { text?: unknown }).text === "string"
        ? (block as { text: string }).text
        : "")
    .filter(Boolean)
    .join("\n");
}

/** 从 toolCall input 里挑一个最有信息量的参数做一行摘要 */
function summarizeToolInput(input: Record<string, unknown>): string {
  const preferred = ["path", "file_path", "filePath", "command", "query", "pattern", "url", "prompt", "relPath"];
  for (const key of preferred) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return truncateSingleLine(value);
  }
  for (const value of Object.values(input)) {
    if (typeof value === "string" && value.trim()) return truncateSingleLine(value);
  }
  return "";
}

/** 把会话消息压成紧凑时间线：连续的 toolCall 归为一组 */
function buildTimeline(messages: AgentMessage[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let seq = 0;
  const nextKey = () => `t${seq++}`;

  for (const raw of messages) {
    const message = normalizeToolCalls(raw);
    if (message.role === "user") {
      const text = extractMessageText(message).trim();
      if (text) items.push({ kind: "user", text, key: nextKey() });
      continue;
    }
    if (message.role !== "assistant") continue;
    let group: ToolCallLine[] | null = null;
    for (const block of (message as AssistantMessage).content) {
      if (block.type === "text" && block.text.trim()) {
        items.push({ kind: "assistant", text: block.text.trim(), key: nextKey() });
        group = null;
      } else if (block.type === "toolCall") {
        const call = block as ToolCallContent;
        if (!group) {
          group = [];
          items.push({ kind: "tools", calls: group, key: nextKey() });
        }
        group.push({ name: call.toolName || "tool", summary: summarizeToolInput(call.input ?? {}) });
      }
    }
  }
  return items;
}

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

export function TaskDetailView({ taskId }: { taskId: string }) {
  const searchParams = useSearchParams();
  const cwd = searchParams.get("cwd") ?? "";

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [cases, setCases] = useState<Case[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [docs, setDocs] = useState<CaseDocEntry[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [docContentError, setDocContentError] = useState<string | null>(null);

  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(new Set());
  const [agentRunning, setAgentRunning] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [liveTools, setLiveTools] = useState<ToolCallLine[]>([]);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const agentRunningRef = useRef(false);
  const handleAgentEventRef = useRef<((event: AgentEvent) => void) | null>(null);
  const composingRef = useRef(false);
  const selectedPathRef = useRef<string | null>(null);
  selectedPathRef.current = selectedPath;

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

  // ---------- 会话消息（工作流时间线） ----------

  const loadSessionMessages = useCallback(async (sid: string) => {
    const params = new URLSearchParams({ deferThinking: "1", deferMedia: "1" });
    const res = await fetch(`/api/sessions/${encodeURIComponent(sid)}?${params}`);
    if (!res.ok) throw new Error(`sessions ${res.status}`);
    const data = (await res.json()) as SessionResponse;
    setMessages(data.context.messages.map((m) => normalizeToolCalls(m)));
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setSessionError(null);
      return;
    }
    let cancelled = false;
    setSessionError(null);
    loadSessionMessages(sessionId).catch((e) => {
      if (!cancelled) setSessionError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, loadSessionMessages]);

  // ---------- 运行状态 ----------

  // 全局 running 集合：页面打开时会话可能已在别处运行
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

  // 初次挂载时对齐一次会话实时状态（刷新页面恰逢运行中）
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetch(`/api/agent/${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AgentStateResponse | null) => {
        if (cancelled || !data) return;
        const busy = Boolean(data.running && data.state && (data.state.isStreaming || data.state.isPromptRunning));
        if (busy) {
          agentRunningRef.current = true;
          setAgentRunning(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const isRunning = agentRunning || (sessionId ? runningSessionIds.has(sessionId) : false);

  // ---------- 会话 SSE（实时时间线） ----------

  const handleAgentEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "agent_start":
          agentRunningRef.current = true;
          setAgentRunning(true);
          setLiveText("");
          setLiveTools([]);
          break;
        case "agent_end":
        case "prompt_done":
          if (!agentRunningRef.current) break;
          agentRunningRef.current = false;
          setAgentRunning(false);
          setLiveText("");
          setLiveTools([]);
          if (sessionId) loadSessionMessages(sessionId).catch(() => {});
          break;
        case "message_start":
        case "message_update": {
          if (!agentRunningRef.current) break;
          const msg = event.message as Partial<AgentMessage> | undefined;
          if (!msg || msg.role !== "assistant") break;
          const normalized = normalizeToolCalls(msg as AgentMessage) as AssistantMessage;
          setLiveText(extractMessageText(normalized));
          break;
        }
        case "message_end": {
          if (!agentRunningRef.current) break;
          const completed = event.message as AgentMessage | undefined;
          if (!completed) break;
          const normalized = normalizeToolCalls(completed);
          if (normalized.role === "user") {
            // 发送时已乐观插入，同文本的用户消息去重
            const text = extractMessageText(normalized);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "user" && extractMessageText(last) === text) return prev;
              return [...prev, normalized];
            });
          } else {
            setMessages((prev) => [...prev, normalized]);
          }
          setLiveText("");
          setLiveTools([]);
          break;
        }
        case "tool_execution_start": {
          const name = (event.toolName as string | undefined) ?? "tool";
          setLiveTools((prev) => [...prev, { name, summary: "" }]);
          break;
        }
      }
    },
    [sessionId, loadSessionMessages],
  );
  handleAgentEventRef.current = handleAgentEvent;

  const connectEvents = useCallback((sid: string): Promise<EventSource> => {
    const existing = eventSourceRef.current;
    if (existing && existing.readyState === EventSource.OPEN) return Promise.resolve(existing);
    if (existing) {
      existing.close();
      eventSourceRef.current = null;
    }
    const es = new EventSource(`/api/agent/${encodeURIComponent(sid)}/events`);
    eventSourceRef.current = es;

    return new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(es);
      };
      const timeout = setTimeout(settle, 5000);
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data as string) as AgentEvent;
          if (event.type === "connected") settle();
          handleAgentEventRef.current?.(event);
        } catch {
          // 忽略畸形帧
        }
      };
      es.onerror = () => {
        // CLOSED 表示致命错误，不再自动重连；先放行，让发送方继续
        if (es.readyState === EventSource.CLOSED) settle();
      };
    });
  }, []);

  // 有 sessionId 就保持 SSE 常开：运行中推送时间线，也是追问前必须建立的连接
  useEffect(() => {
    if (!sessionId) return;
    void connectEvents(sessionId);
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [sessionId, connectEvents]);

  // ---------- 案件文档 ----------

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

  // 运行结束后再做一次最终刷新（覆盖 agent_end 与 running SSE 两条结束路径）
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (prevRunningRef.current && !isRunning && caseId) {
      loadDocs().catch(() => {});
      const path = selectedPathRef.current;
      if (path) loadDocContent(path).catch(() => {});
    }
    prevRunningRef.current = isRunning;
  }, [isRunning, caseId, loadDocs, loadDocContent]);

  // ---------- 追问 ----------

  const handleSend = useCallback(async () => {
    const message = draft.trim();
    if (!message || !sessionId || isRunning || sending) return;
    setSending(true);
    setSendError(null);
    try {
      // 顺序与 useAgentSession 一致：先确保 SSE 已连接，再发 prompt
      await connectEvents(sessionId);
      setMessages((prev) => [...prev, { role: "user", content: message, timestamp: Date.now() } as UserMessage]);
      await sendAgentCommand(sessionId, { type: "prompt", message });
      setDraft("");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }, [draft, sessionId, isRunning, sending, connectEvents]);

  // ---------- 渲染 ----------

  const timeline = useMemo(() => buildTimeline(messages), [messages]);
  const lastAssistantKey = useMemo(() => {
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].kind === "assistant") return timeline[i].key;
    }
    return null;
  }, [timeline]);

  const boardHref = task ? `/board/${task.caseId}?cwd=${encodeURIComponent(cwd)}` : undefined;
  const today = todayString();
  const overdue = Boolean(task?.deadline && task.deadline.slice(0, 10) < today && task.status !== "完成");
  const composerDisabled = !sessionId || isRunning || sending;

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

  return shell(
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      {/* ============ 左栏：指令 + 工作流 + 追问 ============ */}
      <div
        style={{
          width: 400,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {/* 返回 */}
          <Link
            href={boardHref ?? "/board"}
            style={{
              ...MICRO,
              color: "var(--text-muted)",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            ← {currentCase?.title ?? "返回看板"}
          </Link>

          {/* 标题 + meta */}
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {task.title}
          </div>
          <div
            style={{
              ...MICRO,
              color: "var(--text-dim)",
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span>{task.status}</span>
            <span>{task.assignee}</span>
            {task.deadline && (
              <span style={{ color: overdue ? "var(--accent)" : undefined }}>
                {formatDeadline(task.deadline)}
                {overdue ? " · 已逾期" : ""}
              </span>
            )}
            {isRunning && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)" }}>
                <PulseSquare />
                执行中
              </span>
            )}
          </div>

          {/* 指令 */}
          <div
            style={{
              marginTop: 16,
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

          {/* 工作流 */}
          <div style={{ marginTop: 24 }}>
            <div style={{ ...MICRO, color: "var(--text-dim)", paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              工作流
            </div>

            {!sessionId && (
              <div style={{ padding: "12px 0", fontSize: 12, color: "var(--text-dim)" }}>
                尚未关联会话
              </div>
            )}
            {sessionError && <ErrorLine text={sessionError} />}

            {timeline.map((item) => {
              if (item.kind === "user") {
                return (
                  <div key={item.key} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ ...MICRO, color: "var(--accent)" }}>用户</span>
                    <p style={{ margin: "4px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>{item.text}</p>
                  </div>
                );
              }
              if (item.kind === "assistant") {
                const collapsed = item.key !== lastAssistantKey;
                return (
                  <div key={item.key} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ ...MICRO, color: "var(--text-dim)" }}>{task.assignee}</span>
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: "var(--text-muted)",
                        whiteSpace: "pre-wrap",
                        ...(collapsed
                          ? {
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 3,
                            overflow: "hidden",
                          }
                          : {}),
                      }}
                    >
                      {item.text}
                    </p>
                  </div>
                );
              }
              return (
                <div key={item.key} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  {item.calls.map((call, i) => (
                    <div
                      key={`${item.key}-${i}`}
                      style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0", minWidth: 0 }}
                    >
                      <span style={{ width: 6, height: 6, background: "var(--accent)", flexShrink: 0, alignSelf: "center" }} />
                      <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: "var(--text)", flexShrink: 0 }}>
                        {call.name}
                      </span>
                      {call.summary && (
                        <span
                          style={{
                            ...MONO,
                            fontSize: 11,
                            color: "var(--text-dim)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                          }}
                        >
                          {call.summary}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}

            {/* 实时部分 */}
            {isRunning && (
              <div style={{ padding: "10px 0" }}>
                {liveText && (
                  <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
                    {liveText}
                  </p>
                )}
                {liveTools.map((call, i) => (
                  <div key={`live-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                    <span style={{ width: 6, height: 6, background: "var(--accent)", flexShrink: 0 }} />
                    <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{call.name}</span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <PulseSquare />
                  <span style={{ ...MICRO, letterSpacing: "0.06em", color: "var(--accent)" }}>执行中</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 追问输入 */}
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 2, padding: "10px 12px" }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !composingRef.current) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              placeholder={sessionId ? "追问或追加指令…" : "尚未关联会话，无法追问"}
              disabled={composerDisabled}
              rows={2}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                resize: "none",
                font: "inherit",
                fontSize: 13,
                background: "transparent",
                color: "var(--text)",
                display: "block",
                padding: 0,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={composerDisabled || !draft.trim()}
                style={{
                  width: 28,
                  height: 28,
                  border: "none",
                  borderRadius: 2,
                  background: "var(--accent)",
                  color: "white",
                  fontSize: 15,
                  lineHeight: 1,
                  cursor: composerDisabled || !draft.trim() ? "not-allowed" : "pointer",
                  opacity: composerDisabled || !draft.trim() ? 0.4 : 1,
                }}
              >
                →
              </button>
            </div>
          </div>
          {sendError && <ErrorLine text={sendError} />}
        </div>
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
            return (
              <button
                key={doc.path}
                type="button"
                onClick={() => setSelectedPath(doc.path)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  width: "100%",
                  marginTop: 6,
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
                <span style={{ ...MONO, fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>
                  {formatMtime(doc.mtime)}
                </span>
              </button>
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

function CenteredNote({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ ...MICRO, color: accent ? "var(--accent)" : "var(--text-dim)" }}>{text}</span>
    </div>
  );
}
