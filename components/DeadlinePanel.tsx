"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { Case, Deadline, DeadlineType, Schedule, ScheduleType } from "@/lib/mju-models";
import { animationCss, buttonPrimary, colors, inputBase, inputBlur, inputFocus, modalBackdrop, modalPanel, radius, tagBase } from "@/lib/design-system";

type EntryMode = "deadline" | "schedule";

const deadlineTypes: Record<DeadlineType, string> = { court: "法院期限", filing: "提交期限", client: "客户期限", internal: "内部期限" };
const scheduleTypes: Record<ScheduleType, string> = { "court-hearing": "开庭", "client-meeting": "客户会议", "internal-meeting": "内部会议", other: "其他日程" };

function dayStart(value: string): number { return new Date(`${value.slice(0, 10)}T00:00:00`).getTime(); }
function dayText(value: string): string { return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value.slice(0, 10)}T00:00:00`)); }

export function DeadlinePanel({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const isMobile = useIsMobile();
  const [cases, setCases] = useState<Case[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [mode, setMode] = useState<EntryMode>("deadline");
  const [caseId, setCaseId] = useState("");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [type, setType] = useState<DeadlineType | ScheduleType>("court");
  const [location, setLocation] = useState("");
  const [windowDays, setWindowDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = `?cwd=${encodeURIComponent(cwd)}`;
      const [caseResponse, deadlineResponse, scheduleResponse] = await Promise.all([fetch(`/api/cases${query}`), fetch(`/api/deadlines${query}`), fetch(`/api/schedules${query}`)]);
      const caseData = await caseResponse.json() as { cases?: Case[]; error?: string };
      const deadlineData = await deadlineResponse.json() as { deadlines?: Deadline[]; error?: string };
      const scheduleData = await scheduleResponse.json() as { schedules?: Schedule[]; error?: string };
      if (!caseResponse.ok || !deadlineResponse.ok || !scheduleResponse.ok) throw new Error(caseData.error || deadlineData.error || scheduleData.error || "无法载入期限与日程");
      const nextCases = caseData.cases ?? [];
      setCases(nextCases); setDeadlines(deadlineData.deadlines ?? []); setSchedules(scheduleData.schedules ?? []);
      setCaseId((current) => current || nextCases[0]?.id || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [cwd]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setType(mode === "deadline" ? "court" : "court-hearing"); }, [mode]);

  const entries = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const future = new Date(today); future.setDate(today.getDate() + windowDays);
    const caseById = new Map(cases.map((item) => [item.id, item.title]));
    const deadlineEntries = deadlines.filter((item) => item.status !== "done").map((item) => ({ id: item.id, kind: "deadline" as const, title: item.title, date: item.date, caseTitle: caseById.get(item.caseId) ?? "未关联案件", type: deadlineTypes[item.type], overdue: dayStart(item.date) < today.getTime() }));
    const scheduleEntries = schedules.map((item) => ({ id: item.id, kind: "schedule" as const, title: item.title, date: item.datetime, caseTitle: caseById.get(item.caseId) ?? "未关联案件", type: scheduleTypes[item.type], overdue: dayStart(item.datetime) < today.getTime() }));
    return [...deadlineEntries, ...scheduleEntries].filter((item) => item.overdue || dayStart(item.date) <= future.getTime()).sort((a, b) => a.date.localeCompare(b.date));
  }, [cases, deadlines, schedules, windowDays]);

  const create = async () => {
    if (!caseId || !title.trim() || !when) return;
    setBusy(true); setError(null);
    try {
      const endpoint = mode === "deadline" ? "/api/deadlines" : "/api/schedules";
      const body = mode === "deadline" ? { cwd, caseId, title, date: when, type } : { cwd, caseId, title, datetime: when, type, location };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "创建失败");
      setTitle(""); setWhen(""); setLocation(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const markDone = async (id: string) => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/deadlines", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd, id, status: "done" }) });
      const data = await response.json() as { deadline?: Deadline; error?: string };
      if (!response.ok) throw new Error(data.error || "更新失败");
      setDeadlines((current) => current.map((item) => item.id === id ? data.deadline! : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  return <><style>{animationCss}</style><div style={modalBackdrop()} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div style={modalPanel(isMobile ? "100%" : 940, isMobile ? "100%" : 660)}><header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "24px 28px", borderBottom: `1px solid ${colors.borderLight}` }}><div><h2 style={{ margin: 0, color: colors.text, fontSize: 24, letterSpacing: "-.02em" }}>期限与日程</h2><div style={{ marginTop: 5, color: colors.textSecondary, fontSize: 14 }}>优先查看开庭、提交与客户承诺日期</div></div><button onClick={onClose} aria-label="关闭" style={{ width: 36, height: 36, border: "none", borderRadius: radius.md, color: colors.textSecondary, background: colors.bgSecondary, fontSize: 22, cursor: "pointer" }}>×</button></header><div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flex: 1, minHeight: 0 }}><aside style={{ width: isMobile ? "100%" : 300, flexShrink: 0, padding: 22, overflow: "auto", background: colors.bgTertiary, borderRight: isMobile ? "none" : `1px solid ${colors.borderLight}`, borderBottom: isMobile ? `1px solid ${colors.borderLight}` : "none" }}><div style={{ display: "flex", gap: 6, marginBottom: 16 }}><button onClick={() => setMode("deadline")} style={{ flex: 1, padding: "9px 8px", borderRadius: radius.md, border: `1px solid ${mode === "deadline" ? colors.accent : colors.border}`, color: mode === "deadline" ? colors.accent : colors.textSecondary, background: mode === "deadline" ? colors.accentSoft : colors.card, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>期限</button><button onClick={() => setMode("schedule")} style={{ flex: 1, padding: "9px 8px", borderRadius: radius.md, border: `1px solid ${mode === "schedule" ? colors.accent : colors.border}`, color: mode === "schedule" ? colors.accent : colors.textSecondary, background: mode === "schedule" ? colors.accentSoft : colors.card, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>日程</button></div>{cases.length === 0 && !loading ? <div style={{ padding: 14, borderRadius: radius.md, background: colors.warningSoft, color: colors.warning, fontSize: 13, lineHeight: 1.6 }}>请先创建案件，再登记期限或日程。</div> : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}><label style={{ color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>案件<select value={caseId} onChange={(event) => setCaseId(event.target.value)} style={{ ...inputBase(), marginTop: 6 }} onFocus={inputFocus} onBlur={inputBlur}><option value="">选择案件</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label style={{ color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>{mode === "deadline" ? "期限事项" : "日程事项"}<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={mode === "deadline" ? "例如：举证期限届满" : "例如：第一次开庭"} style={{ ...inputBase(), marginTop: 6 }} onFocus={inputFocus} onBlur={inputBlur} /></label><label style={{ color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>{mode === "deadline" ? "日期" : "日期与时间"}<input type={mode === "deadline" ? "date" : "datetime-local"} value={when} onChange={(event) => setWhen(event.target.value)} style={{ ...inputBase(), marginTop: 6 }} onFocus={inputFocus} onBlur={inputBlur} /></label><label style={{ color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>类型<select value={type} onChange={(event) => setType(event.target.value as DeadlineType | ScheduleType)} style={{ ...inputBase(), marginTop: 6 }} onFocus={inputFocus} onBlur={inputBlur}>{Object.entries(mode === "deadline" ? deadlineTypes : scheduleTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{mode === "schedule" && <label style={{ color: colors.textSecondary, fontSize: 12, fontWeight: 600 }}>地点<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="可选" style={{ ...inputBase(), marginTop: 6 }} onFocus={inputFocus} onBlur={inputBlur} /></label>}<button onClick={() => void create()} disabled={busy || !caseId || !title.trim() || !when} style={buttonPrimary(busy || !caseId || !title.trim() || !when)}>{busy ? "处理中…" : mode === "deadline" ? "登记期限" : "登记日程"}</button></div>}</aside><main style={{ flex: 1, minWidth: 0, overflow: "auto", padding: 22, background: colors.bg }}>{error && <div style={{ marginBottom: 14, borderRadius: radius.md, padding: "10px 12px", background: colors.errorSoft, color: colors.error, fontSize: 13 }}>{error}</div>}<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 16 }}><div style={{ color: colors.text, fontWeight: 700, fontSize: 14 }}>待关注事项</div><div style={{ display: "flex", gap: 5 }}>{[7, 30].map((days) => <button key={days} onClick={() => setWindowDays(days)} style={{ padding: "6px 9px", border: `1px solid ${windowDays === days ? colors.accent : colors.border}`, borderRadius: radius.md, color: windowDays === days ? colors.accent : colors.textSecondary, background: windowDays === days ? colors.accentSoft : colors.card, cursor: "pointer", fontSize: 11 }}>{days} 天</button>)}</div></div>{loading ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{[1, 2, 3].map((key) => <div key={key} style={{ height: 86, borderRadius: radius.lg, background: colors.bgSecondary, animation: "mju-pulse-subtle 1.5s ease-in-out infinite" }} />)}</div> : entries.length === 0 ? <div style={{ padding: "80px 20px", textAlign: "center", color: colors.textTertiary, fontSize: 14 }}>未来 {windowDays} 天没有待关注的期限或日程。</div> : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{entries.map((entry) => <article key={`${entry.kind}-${entry.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, border: `1px solid ${entry.overdue ? "rgba(220,38,38,.25)" : colors.borderLight}`, borderRadius: radius.lg, background: colors.card, boxShadow: colors.shadowSm }}><div style={{ minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}><div style={{ fontWeight: 650, color: colors.text, fontSize: 13 }}>{entry.title}</div><span style={tagBase(entry.overdue ? colors.errorSoft : entry.kind === "schedule" ? colors.accentSoft : colors.warningSoft, entry.overdue ? colors.error : entry.kind === "schedule" ? colors.accent : colors.warning)}>{entry.overdue ? "已逾期" : entry.type}</span></div><div style={{ display: "flex", gap: 10, marginTop: 6, color: colors.textSecondary, fontSize: 12 }}><span>{entry.caseTitle}</span><span>{dayText(entry.date)}</span></div></div>{entry.kind === "deadline" && <button onClick={() => void markDone(entry.id)} disabled={busy} style={{ padding: "7px 10px", border: `1px solid ${colors.border}`, borderRadius: radius.md, background: colors.bgSecondary, color: colors.textSecondary, cursor: "pointer", fontSize: 12, flexShrink: 0 }}>完成</button>}</article>)}</div>}</main></div></div></div></>;
}
