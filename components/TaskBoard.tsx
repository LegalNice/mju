"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { colors, radius, animationCss, modalBackdrop, modalPanel, buttonPrimary, inputBase, inputFocus, inputBlur, cardBase, cardHover, cardLeave } from "@/lib/design-system";

type Status = "backlog" | "active" | "done";
type Task = { id: string; title: string; detail: string; agent: string; status: Status; createdAt: string; output?: string; error?: string };
type Agent = { name: string; description: string; scope: "user" | "project" };

const columns: Array<{ id: Status; label: string; hint: string; color: string }> = [
  { id: "backlog", label: "待处理", hint: "准备分配", color: colors.textTertiary },
  { id: "active", label: "执行中", hint: "正在工作", color: colors.accent },
  { id: "done", label: "已完成", hint: "留下结果", color: colors.success },
];

function LoadingSpinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14, height: 14,
        border: `2px solid ${colors.accentSoft}`,
        borderTopColor: colors.accent,
        borderRadius: "50%",
        animation: "mju-spin .8s linear infinite",
      }}
    />
  );
}

export function TaskBoard({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [agent, setAgent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = `?cwd=${encodeURIComponent(cwd)}`;
      const [board, agentResponse] = await Promise.all([fetch(`/api/board${query}`), fetch(`/api/agents${query}`)]);
      const boardData = await board.json() as { tasks?: Task[]; error?: string };
      const agentData = await agentResponse.json() as { agents?: Agent[] };
      if (!board.ok || boardData.error) throw new Error(boardData.error || "无法载入看板");
      setTasks(boardData.tasks ?? []);
      setAgents(agentData.agents ?? []);
      if (!agent && agentData.agents?.[0]) setAgent(agentData.agents[0].name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cwd, agent]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!title.trim() || !agent) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, title, detail, agent }),
      });
      const data = await response.json() as { task?: Task; error?: string };
      if (!response.ok) throw new Error(data.error || "创建失败");
      setTasks((current) => [data.task!, ...current]);
      setTitle("");
      setDetail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const run = async (task: Task) => {
    setBusy(true);
    setError(null);
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "active" } : item));
    try {
      const response = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, action: "run", id: task.id }),
      });
      const data = await response.json() as { task?: Task; error?: string };
      if (!response.ok) throw new Error(data.error || "执行失败");
      setTasks((current) => current.map((item) => item.id === task.id ? data.task! : item));
      setSelected(data.task!);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.id, tasks.filter((task) => task.status === column.id)])) as Record<Status, Task[]>,
    [tasks],
  );

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 12, color: colors.textSecondary, fontWeight: 600,
  };

  const selectStyle: React.CSSProperties = {
    ...inputBase(),
    appearance: "none",
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235c5c5c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
  };

  return (
    <>
      <style>{animationCss}</style>
      <div style={modalBackdrop()} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div style={modalPanel(isMobile ? "100%" : 1120, isMobile ? "100%" : 720)}>
          <header
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "24px 28px", borderBottom: `1px solid ${colors.borderLight}`,
              background: colors.card,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: colors.text }}>
                任务看板
              </h2>
              <div style={{ marginTop: 4, fontSize: 14, color: colors.textSecondary }}>
                把任务交给合适的 Agent，结果会留在项目看板里
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="关闭"
              style={{
                width: 36, height: 36, border: "none", borderRadius: radius.md,
                background: colors.bgSecondary, color: colors.textSecondary,
                fontSize: 22, lineHeight: 1, cursor: "pointer",
                display: "grid", placeItems: "center",
                transition: "background .2s ease, transform .2s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.border; e.currentTarget.style.transform = "scale(1.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.bgSecondary; e.currentTarget.style.transform = "scale(1)"; }}
            >
              ×
            </button>
          </header>

          <div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: isMobile ? "column" : "row" }}>
            <aside
              style={{
                width: isMobile ? "100%" : 300, flexShrink: 0, padding: 24,
                borderRight: isMobile ? "none" : `1px solid ${colors.borderLight}`,
                borderBottom: isMobile ? `1px solid ${colors.borderLight}` : "none",
                overflow: "auto",
                background: colors.bgTertiary,
              }}
            >
              <div style={{ fontSize: 12, color: colors.textTertiary, fontWeight: 600, letterSpacing: ".06em", marginBottom: 14, textTransform: "uppercase" }}>
                新建任务
              </div>
              <div
                style={{
                  padding: 16, borderRadius: radius.lg, background: colors.card,
                  border: `1px solid ${colors.borderLight}`,
                  animation: "mju-slide-up .35s cubic-bezier(.16,1,.3,1) .05s both",
                }}
              >
                <label style={labelStyle}>
                  任务名称
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="整理合同审查意见"
                    style={{ ...inputBase(), marginTop: 6 }}
                    onFocus={inputFocus}
                    onBlur={inputBlur}
                  />
                </label>
                <label style={{ ...labelStyle, marginTop: 14 }}>
                  分配给
                  <select
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                    style={{ ...selectStyle, marginTop: 6 }}
                  >
                    <option value="">先创建 Subagent</option>
                    {agents.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name} · {item.scope === "project" ? "项目" : "全局"}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ ...labelStyle, marginTop: 14 }}>
                  任务说明
                  <textarea
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    rows={5}
                    placeholder="补充目标、材料、交付格式……"
                    style={{ ...inputBase(), marginTop: 6, resize: "vertical", lineHeight: 1.6 }}
                    onFocus={inputFocus}
                    onBlur={inputBlur}
                  />
                </label>
                <button
                  onClick={() => void create()}
                  disabled={busy || !title.trim() || !agent}
                  style={{
                    ...buttonPrimary(busy || !title.trim() || !agent),
                    width: "100%", marginTop: 16,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                  onMouseEnter={(e) => { if (!busy && title.trim() && agent) { e.currentTarget.style.background = colors.accentHover; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                  onMouseLeave={(e) => { if (!busy && title.trim() && agent) { e.currentTarget.style.background = colors.accent; e.currentTarget.style.transform = "translateY(0)"; } }}
                >
                  {busy ? <LoadingSpinner /> : null}
                  {busy ? "处理中…" : "创建任务"}
                </button>
              </div>
            </aside>

            <main style={{ flex: 1, minWidth: 0, minHeight: 0, padding: 24, overflow: "auto", background: colors.bg }}>
              {error && (
                <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: radius.md, background: colors.errorSoft, color: colors.error, fontSize: 13 }}>
                  {error}
                </div>
              )}
              {loading ? (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(190px, 1fr))", gap: 14 }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} style={{ minHeight: 200, borderRadius: radius.lg, background: colors.bgSecondary, animation: "mju-pulse-subtle 1.5s ease-in-out infinite" }} />
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(190px, 1fr))", gap: 14, alignItems: "start" }}>
                  {columns.map((column, colIndex) => (
                    <div
                      key={column.id}
                      style={{
                        minHeight: 160, padding: 14, borderRadius: radius.lg,
                        background: colors.bgTertiary,
                        border: `1px solid ${colors.borderLight}`,
                        animation: `mju-slide-up .35s cubic-bezier(.16,1,.3,1) ${colIndex * 0.06}s both`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 4px 12px" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: colors.text, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: column.color }} />
                            {column.label}
                          </div>
                          <div style={{ color: colors.textTertiary, fontSize: 11, marginTop: 3 }}>{column.hint}</div>
                        </div>
                        <span style={{ color: colors.textTertiary, fontSize: 12, background: colors.card, padding: "2px 8px", borderRadius: radius.full }}>
                          {grouped[column.id].length}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {grouped[column.id].map((task, index) => (
                          <article
                            key={task.id}
                            onClick={() => setSelected(task)}
                            style={{
                              ...cardBase(),
                              padding: 14,
                              cursor: "pointer",
                              animation: `mju-slide-up .3s cubic-bezier(.16,1,.3,1) ${0.1 + index * 0.05}s both`,
                            }}
                            onMouseEnter={cardHover}
                            onMouseLeave={cardLeave}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: colors.text }}>
                              {task.title}
                            </div>
                            <div style={{ marginTop: 8, color: colors.accent, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                              {task.agent}
                            </div>
                            {task.status === "backlog" && (
                              <button
                                onClick={(event) => { event.stopPropagation(); void run(task); }}
                                disabled={busy}
                                style={{
                                  width: "100%", marginTop: 10, padding: "8px 10px", borderRadius: radius.md,
                                  border: `1px solid ${colors.border}`,
                                  background: colors.bgSecondary, color: colors.text,
                                  fontSize: 11, cursor: "pointer", transition: "all .2s ease",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = colors.accent; e.currentTarget.style.color = "#fff"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = colors.bgSecondary; e.currentTarget.style.color = colors.text; }}
                              >
                                运行任务
                              </button>
                            )}
                            {task.status === "active" && (
                              <div style={{ marginTop: 10, color: colors.accent, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                                <LoadingSpinner />
                                正在执行…
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </main>
          </div>

          {selected && (
            <div
              style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                background: "rgba(0,0,0,.2)",
                animation: "mju-fade-in .2s ease-out",
              }}
              onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}
            >
              <div
                style={{
                  width: isMobile ? "100%" : 640, maxHeight: "80%", overflow: "auto",
                  padding: 24, borderRadius: radius.xl, background: colors.card,
                  boxShadow: colors.shadowLg,
                  border: `1px solid ${colors.borderLight}`,
                  animation: "mju-scale-in .25s cubic-bezier(.16,1,.3,1)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ color: colors.accent, fontSize: 11, letterSpacing: ".08em", fontWeight: 600 }}>
                      {selected.agent}
                    </div>
                    <h3 style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, color: colors.text }}>
                      {selected.title}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    style={{
                      width: 32, height: 32, border: "none", borderRadius: radius.md,
                      background: colors.bgSecondary, color: colors.textSecondary,
                      fontSize: 20, cursor: "pointer", display: "grid", placeItems: "center",
                    }}
                  >
                    ×
                  </button>
                </div>
                <p style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", marginTop: 16 }}>
                  {selected.detail || "没有补充说明"}
                </p>
                {selected.output && (
                  <pre
                    style={{
                      margin: "16px 0 0", padding: 14, overflow: "auto",
                      borderRadius: radius.md, background: colors.bgTertiary,
                      color: colors.text, fontSize: 12, lineHeight: 1.6,
                      whiteSpace: "pre-wrap", border: `1px solid ${colors.borderLight}`,
                    }}
                  >
                    {selected.output}
                  </pre>
                )}
                {selected.error && (
                  <div style={{ color: colors.error, fontSize: 13, marginTop: 12, padding: "10px 12px", background: colors.errorSoft, borderRadius: radius.md }}>
                    {selected.error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
