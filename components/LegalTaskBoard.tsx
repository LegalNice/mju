"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { Case, DeliverableType, Task, TaskPriority, TaskStatus } from "@/lib/mju-models";
import { animationCss, buttonDanger, buttonPrimary, buttonSecondary, cardBase, cardHover, cardLeave, colors, inputBase, inputBlur, inputFocus, modalBackdrop, modalPanel, radius, tagBase } from "@/lib/design-system";

type TaskDraft = {
  caseId: string;
  title: string;
  detail: string;
  assignee: string;
  priority: TaskPriority;
  deadline: string;
  estimatedHours: string;
  actualHours: string;
  deliverableType: DeliverableType;
};

const statuses: Array<{ id: TaskStatus; label: string; hint: string; color: string }> = [
  { id: "待办", label: "待办", hint: "等待安排", color: colors.textTertiary },
  { id: "进行中", label: "进行中", hint: "正在处理", color: colors.accent },
  { id: "完成", label: "完成", hint: "已交付或已办结", color: colors.success },
  { id: "取消", label: "取消", hint: "不再执行", color: colors.textDim },
];

const priorityLabels: Record<TaskPriority, string> = { high: "高", medium: "中", low: "低" };
const priorityColors: Record<TaskPriority, { bg: string; text: string }> = {
  high: { bg: colors.errorSoft, text: colors.error },
  medium: { bg: colors.warningSoft, text: colors.warning },
  low: { bg: colors.bgSecondary, text: colors.textSecondary },
};
const deliverableLabels: Record<DeliverableType, string> = {
  "internal-opinion": "内部意见",
  "external-opinion": "对外意见",
  "docx-revision": "Word 修订稿",
  pleading: "诉讼文书",
  "evidence-list": "证据目录",
  "trial-outline": "庭审提纲",
  "research-report": "检索报告",
  other: "其他交付物",
};

const blankDraft = (caseId = ""): TaskDraft => ({
  caseId,
  title: "",
  detail: "",
  assignee: "本人",
  priority: "medium",
  deadline: "",
  estimatedHours: "",
  actualHours: "",
  deliverableType: "other",
});

function toDraft(task: Task): TaskDraft {
  return {
    caseId: task.caseId,
    title: task.title,
    detail: task.detail,
    assignee: task.assignee,
    priority: task.priority ?? "medium",
    deadline: task.deadline?.slice(0, 10) ?? "",
    estimatedHours: task.estimatedHours === undefined ? "" : String(task.estimatedHours),
    actualHours: task.actualHours === undefined ? "" : String(task.actualHours),
    deliverableType: task.deliverableType ?? "other",
  };
}

function dateLabel(value?: string): string {
  if (!value) return "未设截止";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function isOverdue(task: Task): boolean {
  return task.status !== "完成" && task.status !== "取消" && Boolean(task.deadline) && task.deadline!.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function SelectArrow() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><path d="m6 9 6 6 6-6" /></svg>;
}

export function LegalTaskBoard({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const isMobile = useIsMobile();
  const [cases, setCases] = useState<Case[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState<TaskDraft>(blankDraft());
  const [selected, setSelected] = useState<Task | null>(null);
  const [editDraft, setEditDraft] = useState<TaskDraft>(blankDraft());
  const [editStatus, setEditStatus] = useState<TaskStatus>("待办");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = `?cwd=${encodeURIComponent(cwd)}`;
      const [caseResponse, taskResponse] = await Promise.all([fetch(`/api/cases${query}`), fetch(`/api/tasks${query}`)]);
      const caseData = await caseResponse.json() as { cases?: Case[]; error?: string };
      const taskData = await taskResponse.json() as { tasks?: Task[]; error?: string };
      if (!caseResponse.ok) throw new Error(caseData.error || "无法载入案件");
      if (!taskResponse.ok) throw new Error(taskData.error || "无法载入任务");
      const nextCases = caseData.cases ?? [];
      setCases(nextCases);
      setTasks(taskData.tasks ?? []);
      setDraft((current) => current.caseId || nextCases.length === 0 ? current : { ...current, caseId: nextCases[0].id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => { void load(); }, [load]);

  const caseById = useMemo(() => new Map(cases.map((item) => [item.id, item])), [cases]);
  const grouped = useMemo(() => Object.fromEntries(statuses.map((status) => [status.id, tasks.filter((task) => task.status === status.id)])) as Record<TaskStatus, Task[]>, [tasks]);

  const createTask = async () => {
    if (!draft.caseId || !draft.title.trim() || !draft.assignee.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd,
          caseId: draft.caseId,
          title: draft.title,
          detail: draft.detail,
          assignee: draft.assignee,
          priority: draft.priority,
          deadline: draft.deadline || undefined,
          estimatedHours: draft.estimatedHours ? Number(draft.estimatedHours) : undefined,
          deliverableType: draft.deliverableType,
        }),
      });
      const data = await response.json() as { task?: Task; error?: string };
      if (!response.ok) throw new Error(data.error || "创建任务失败");
      setTasks((current) => [...current, data.task!]);
      setDraft(blankDraft(draft.caseId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const openTask = (task: Task) => {
    setSelected(task);
    setEditDraft(toDraft(task));
    setEditStatus(task.status);
  };

  const updateTask = async () => {
    if (!selected || !editDraft.title.trim() || !editDraft.assignee.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd,
          id: selected.id,
          caseId: editDraft.caseId,
          title: editDraft.title,
          detail: editDraft.detail,
          assignee: editDraft.assignee,
          status: editStatus,
          priority: editDraft.priority,
          deadline: editDraft.deadline || undefined,
          estimatedHours: editDraft.estimatedHours ? Number(editDraft.estimatedHours) : undefined,
          actualHours: editDraft.actualHours ? Number(editDraft.actualHours) : undefined,
          deliverableType: editDraft.deliverableType,
        }),
      });
      const data = await response.json() as { task?: Task; error?: string };
      if (!response.ok) throw new Error(data.error || "保存任务失败");
      setTasks((current) => current.map((item) => item.id === data.task!.id ? data.task! : item));
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = async () => {
    if (!selected || !window.confirm(`删除任务“${selected.title}”？`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks?cwd=${encodeURIComponent(cwd)}&id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "删除任务失败");
      setTasks((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, content: React.ReactNode, wide = false) => <label style={{ display: "block", gridColumn: wide ? "1 / -1" : undefined, color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>{label}<div style={{ marginTop: 6 }}>{content}</div></label>;
  const selectStyle: React.CSSProperties = { ...inputBase(), appearance: "none", paddingRight: 32 };
  const taskForm = (value: TaskDraft, setValue: React.Dispatch<React.SetStateAction<TaskDraft>>, includeActual = false) => <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 14 }}>
    {field("案件", <div style={{ position: "relative" }}><select value={value.caseId} onChange={(event) => setValue((current) => ({ ...current, caseId: event.target.value }))} style={selectStyle} onFocus={inputFocus} onBlur={inputBlur}><option value="">选择案件</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><SelectArrow /></div>)}
    {field("负责人／Agent", <input value={value.assignee} onChange={(event) => setValue((current) => ({ ...current, assignee: event.target.value }))} placeholder="本人或 Agent 名称" style={inputBase()} onFocus={inputFocus} onBlur={inputBlur} />)}
    {field("任务名称", <input value={value.title} onChange={(event) => setValue((current) => ({ ...current, title: event.target.value }))} placeholder="例如：核对证据目录" style={inputBase()} onFocus={inputFocus} onBlur={inputBlur} />, true)}
    {field("优先级", <div style={{ position: "relative" }}><select value={value.priority} onChange={(event) => setValue((current) => ({ ...current, priority: event.target.value as TaskPriority }))} style={selectStyle} onFocus={inputFocus} onBlur={inputBlur}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select><SelectArrow /></div>)}
    {field("截止日期", <input type="date" value={value.deadline} onChange={(event) => setValue((current) => ({ ...current, deadline: event.target.value }))} style={inputBase()} onFocus={inputFocus} onBlur={inputBlur} />)}
    {field("交付物", <div style={{ position: "relative" }}><select value={value.deliverableType} onChange={(event) => setValue((current) => ({ ...current, deliverableType: event.target.value as DeliverableType }))} style={selectStyle} onFocus={inputFocus} onBlur={inputBlur}>{Object.entries(deliverableLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select><SelectArrow /></div>)}
    {field("预估工时", <input type="number" min="0" step="0.5" value={value.estimatedHours} onChange={(event) => setValue((current) => ({ ...current, estimatedHours: event.target.value }))} placeholder="小时" style={inputBase()} onFocus={inputFocus} onBlur={inputBlur} />)}
    {includeActual && field("实际工时", <input type="number" min="0" step="0.5" value={value.actualHours} onChange={(event) => setValue((current) => ({ ...current, actualHours: event.target.value }))} placeholder="小时" style={inputBase()} onFocus={inputFocus} onBlur={inputBlur} />)}
    {field("任务说明", <textarea value={value.detail} onChange={(event) => setValue((current) => ({ ...current, detail: event.target.value }))} rows={4} placeholder="写明目标、材料范围与交付要求" style={{ ...inputBase(), resize: "vertical", lineHeight: 1.6 }} onFocus={inputFocus} onBlur={inputBlur} />, true)}
  </div>;

  return <>
    <style>{animationCss}</style>
    <div style={modalBackdrop()} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div style={modalPanel(isMobile ? "100%" : 1220, isMobile ? "100%" : 760)}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "24px 28px", borderBottom: `1px solid ${colors.borderLight}` }}>
          <div><h2 style={{ margin: 0, color: colors.text, fontSize: 24, letterSpacing: "-.02em" }}>法律任务</h2><div style={{ marginTop: 5, color: colors.textSecondary, fontSize: 14 }}>围绕案件分派、跟进与交付</div></div>
          <button onClick={onClose} aria-label="关闭" style={{ width: 36, height: 36, border: "none", borderRadius: radius.md, color: colors.textSecondary, background: colors.bgSecondary, fontSize: 22, cursor: "pointer" }}>×</button>
        </header>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flex: 1, minHeight: 0 }}>
          <aside style={{ width: isMobile ? "100%" : 315, flexShrink: 0, padding: 22, overflow: "auto", borderRight: isMobile ? "none" : `1px solid ${colors.borderLight}`, borderBottom: isMobile ? `1px solid ${colors.borderLight}` : "none", background: colors.bgTertiary }}>
            <div style={{ color: colors.textTertiary, fontWeight: 700, letterSpacing: ".08em", fontSize: 11, marginBottom: 12 }}>新建任务</div>
            {cases.length === 0 && !loading ? <div style={{ padding: 14, borderRadius: radius.md, background: colors.warningSoft, color: colors.warning, fontSize: 13, lineHeight: 1.6 }}>请先在“案件与项目”中创建案件，再建立任务。</div> : <>
              {taskForm(draft, setDraft)}
              <button onClick={() => void createTask()} disabled={busy || !draft.caseId || !draft.title.trim() || !draft.assignee.trim()} style={{ ...buttonPrimary(busy || !draft.caseId || !draft.title.trim() || !draft.assignee.trim()), marginTop: 16, width: "100%" }}>{busy ? "处理中…" : "创建任务"}</button>
            </>}
          </aside>
          <main style={{ flex: 1, minWidth: 0, overflow: "auto", padding: 22, background: colors.bg }}>
            {error && <div style={{ marginBottom: 14, borderRadius: radius.md, padding: "10px 12px", background: colors.errorSoft, color: colors.error, fontSize: 13 }}>{error}</div>}
            {loading ? <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(230px, 1fr))", gap: 14 }}>{[1, 2, 3, 4].map((key) => <div key={key} style={{ height: 180, borderRadius: radius.lg, background: colors.bgSecondary, animation: "mju-pulse-subtle 1.5s ease-in-out infinite" }} />)}</div> : <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(230px, 1fr))", gap: 14 }}>
              {statuses.map((column, columnIndex) => <section key={column.id} style={{ minHeight: 160, border: `1px solid ${colors.borderLight}`, borderRadius: radius.lg, padding: 14, background: colors.bgTertiary, animation: `mju-slide-up .35s cubic-bezier(.16,1,.3,1) ${columnIndex * .05}s both` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 2px 12px" }}><div><div style={{ color: colors.text, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: column.color }} />{column.label}</div><div style={{ color: colors.textTertiary, fontSize: 11, marginTop: 3 }}>{column.hint}</div></div><span style={{ padding: "2px 8px", borderRadius: radius.full, color: colors.textTertiary, background: colors.card, fontSize: 12 }}>{grouped[column.id].length}</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{grouped[column.id].map((task) => { const overdue = isOverdue(task); const priority = task.priority ?? "medium"; return <article key={task.id} onClick={() => openTask(task)} style={{ ...cardBase(), padding: 14, cursor: "pointer", borderColor: overdue ? "rgba(220,38,38,.3)" : colors.borderLight }} onMouseEnter={cardHover} onMouseLeave={cardLeave}><div style={{ color: colors.text, fontWeight: 650, lineHeight: 1.45, fontSize: 13 }}>{task.title}</div><div style={{ color: colors.textTertiary, fontSize: 11, marginTop: 6 }}>{caseById.get(task.caseId)?.title ?? "未关联案件"}</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}><span style={tagBase(priorityColors[priority].bg, priorityColors[priority].text)}>优先级：{priorityLabels[priority]}</span>{task.deadline && <span style={tagBase(overdue ? colors.errorSoft : colors.bgSecondary, overdue ? colors.error : colors.textSecondary)}>{overdue ? "已逾期 · " : "截止 · "}{dateLabel(task.deadline)}</span>}</div><div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10, fontSize: 11, color: colors.textSecondary }}><span>{task.assignee}</span><span>{deliverableLabels[task.deliverableType ?? "other"]}</span></div></article>; })}</div>
              </section>)}
            </div>}
          </main>
        </div>
        {selected && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,.22)", backdropFilter: "blur(6px)" }} onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div style={{ width: isMobile ? "100%" : 680, maxHeight: "88%", overflow: "auto", padding: 24, borderRadius: radius.xl, background: colors.card, boxShadow: colors.shadowLg }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 18 }}><div><div style={{ color: colors.accent, fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>编辑任务</div><h3 style={{ margin: "5px 0 0", color: colors.text, fontSize: 20 }}>{selected.title}</h3></div><button onClick={() => setSelected(null)} style={{ width: 32, height: 32, border: "none", borderRadius: radius.md, background: colors.bgSecondary, color: colors.textSecondary, fontSize: 20, cursor: "pointer" }}>×</button></div><div style={{ marginBottom: 14 }}>{field("状态", <div style={{ position: "relative" }}><select value={editStatus} onChange={(event) => setEditStatus(event.target.value as TaskStatus)} style={selectStyle} onFocus={inputFocus} onBlur={inputBlur}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select><SelectArrow /></div>)}</div>{taskForm(editDraft, setEditDraft, true)}<div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 22 }}><button onClick={() => void deleteTask()} disabled={busy} style={buttonDanger()}>删除</button><div style={{ display: "flex", gap: 10 }}><button onClick={() => setSelected(null)} style={buttonSecondary()}>取消</button><button onClick={() => void updateTask()} disabled={busy || !editDraft.title.trim() || !editDraft.assignee.trim()} style={buttonPrimary(busy || !editDraft.title.trim() || !editDraft.assignee.trim())}>{busy ? "保存中…" : "保存"}</button></div></div></div></div>}
      </div>
    </div>
  </>;
}
