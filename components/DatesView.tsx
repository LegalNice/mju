"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Case, Deadline, Schedule, Task } from "@/lib/mju-models";
import type { VaultItem } from "@/lib/mju-vault-items";
import { AppNav } from "./AppNav";

const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

/** vault 条目标题前的「文」micro 标记 */
const VAULT_MARK: CSSProperties = {
  ...MICRO,
  letterSpacing: "0.06em",
  color: "var(--text-dim)",
  marginRight: 6,
};

const CASE_TYPE_LABEL: Record<Case["type"], string> = {
  litigation: "争议解决",
  advisory: "顾问",
  project: "专项",
};

type ViewMode = "list" | "week" | "month";

interface DateItem {
  id: string;
  date: string; // YYYY-MM-DD（本地）
  time?: string; // HH:mm
  title: string;
  kind: "task" | "deadline" | "schedule";
  caseId: string; // vault 条目可能缺失（""），此时 caseTitle 取自文件路径
  caseTitle: string;
  caseType: Case["type"];
  overdue: boolean;
  taskId?: string;
  source: "store" | "vault";
}

const KIND_TICK: Record<DateItem["kind"], string> = {
  task: "var(--text-dim)",
  deadline: "var(--accent)",
  schedule: "var(--text)",
};

const KIND_LABEL: Record<DateItem["kind"], string> = {
  task: "任务",
  deadline: "期限",
  schedule: "日程",
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

interface ProjectSummary {
  cwd: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayString(): string {
  return dateString(new Date());
}

/** "YYYY-MM-DD" → 本地 Date（避免 ISO 解析的时区偏移） */
function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** 两个 "YYYY-MM-DD" 相差的天数（a - b） */
function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
}

function weekdayLabel(date: string): string {
  return `周${WEEKDAYS[(parseDate(date).getDay() + 6) % 7]}`;
}

/** "YYYY-MM-DD" → "M 月 D 日" */
function formatMD(date: string): string {
  const d = parseDate(date);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** vault 条目缺 caseId 时，从文件路径 ops/cases/<分组>/<案名>/... 提取案名 */
function caseNameFromPath(filePath: string): string {
  const segs = filePath.split("/");
  const i = segs.lastIndexOf("cases");
  const name = i >= 0 ? segs[i + 2] : undefined;
  return name ?? "文件库";
}

function CenteredNote({ text }: { text: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ ...MICRO, color: "var(--text-dim)" }}>{text}</span>
    </div>
  );
}

/**
 * /dates 全局日程与期限：聚合当前项目所有案件的任务（deadline）、
 * 期限（deadlines）与日程（schedules），列表 / 周 / 月 三种视图切换。
 */
export function DatesView() {
  const [project, setProject] = useState<{ cwd: string; caseId?: string } | null>(null);
  const [resolved, setResolved] = useState<"pending" | "ok" | "empty">("pending");

  const [cases, setCases] = useState<Case[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[] | null>(null);
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [vaultItems, setVaultItems] = useState<VaultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("list");
  const [expanded, setExpanded] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [anchorDate, setAnchorDate] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // 项目解析：优先 localStorage 记录的上次案件，否则取最近项目的 cwd
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        const raw = localStorage.getItem("mju-last-case");
        if (raw) {
          const last = JSON.parse(raw) as { cwd?: string; caseId?: string };
          if (last.cwd) {
            if (!cancelled) {
              setProject({ cwd: last.cwd, caseId: last.caseId });
              setResolved("ok");
            }
            return;
          }
        }
      } catch {
        // 记录损坏则继续走项目解析
      }

      try {
        const res = await fetch("/api/projects");
        if (!res.ok) throw new Error(`projects ${res.status}`);
        const { projects } = (await res.json()) as { projects: ProjectSummary[] };
        const first = projects[0]; // API 已按 updatedAt 倒序
        if (!cancelled) {
          if (first) {
            setProject({ cwd: first.cwd });
            setResolved("ok");
          } else {
            setResolved("empty");
          }
        }
      } catch {
        if (!cancelled) setResolved("empty");
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  // 恢复上次选择的视图
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mju-dates-view");
      if (saved === "list" || saved === "week" || saved === "month") setView(saved);
    } catch {
      // localStorage 不可用时静默
    }
  }, []);

  const changeView = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem("mju-dates-view", v);
    } catch {
      // localStorage 不可用时静默
    }
  };

  const cwd = project?.cwd ?? "";

  // 跨案件聚合：全部按 cwd 拉取，不带 caseId 过滤
  useEffect(() => {
    if (!cwd) return;
    setError(null);
    const q = `cwd=${encodeURIComponent(cwd)}`;
    Promise.all([
      fetch(`/api/cases?${q}`).then(async (res) => {
        if (!res.ok) throw new Error(`cases ${res.status}`);
        return ((await res.json()) as { cases: Case[] }).cases;
      }),
      fetch(`/api/tasks?${q}`).then(async (res) => {
        if (!res.ok) throw new Error(`tasks ${res.status}`);
        return ((await res.json()) as { tasks: Task[] }).tasks;
      }),
      fetch(`/api/deadlines?${q}`).then(async (res) => {
        if (!res.ok) throw new Error(`deadlines ${res.status}`);
        return ((await res.json()) as { deadlines: Deadline[] }).deadlines;
      }),
      fetch(`/api/schedules?${q}`).then(async (res) => {
        if (!res.ok) throw new Error(`schedules ${res.status}`);
        return ((await res.json()) as { schedules: Schedule[] }).schedules;
      }),
      // vault 扫描失败不阻塞整体加载
      fetch(`/api/vault-items?${q}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`vault-items ${res.status}`);
          return ((await res.json()) as { items: VaultItem[] }).items;
        })
        .catch(() => [] as VaultItem[]),
    ])
      .then(([c, t, d, s, v]) => {
        setCases(c);
        setTasks(t);
        setDeadlines(d);
        setSchedules(s);
        setVaultItems(v);
      })
      .catch(() => setError("load failed"));
  }, [cwd]);

  const today = todayString();

  const items = useMemo(() => {
    if (!cases || !tasks || !deadlines || !schedules || !vaultItems) return [];
    const caseMap = new Map(cases.map((c) => [c.id, c]));
    const caseInfo = (caseId: string) => {
      const c = caseMap.get(caseId);
      return { title: c?.title ?? caseId, type: c?.type ?? ("litigation" as Case["type"]) };
    };
    const out: DateItem[] = [];

    for (const t of tasks) {
      if (!t.deadline || t.status === "完成" || t.status === "取消") continue;
      const date = t.deadline.slice(0, 10);
      const info = caseInfo(t.caseId);
      out.push({
        id: t.id,
        date,
        title: t.title,
        kind: "task",
        caseId: t.caseId,
        caseTitle: info.title,
        caseType: info.type,
        overdue: date < today,
        taskId: t.id,
        source: "store",
      });
    }
    for (const d of deadlines) {
      if (d.status === "done") continue;
      const date = d.date.slice(0, 10);
      const info = caseInfo(d.caseId);
      out.push({
        id: d.id,
        date,
        title: d.title,
        kind: "deadline",
        caseId: d.caseId,
        caseTitle: info.title,
        caseType: info.type,
        overdue: date < today,
        source: "store",
      });
    }
    for (const s of schedules) {
      const parsed = new Date(s.datetime);
      const valid = !Number.isNaN(parsed.getTime());
      const date = valid ? dateString(parsed) : s.datetime.slice(0, 10);
      const info = caseInfo(s.caseId);
      out.push({
        id: s.id,
        date,
        time: valid ? `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}` : undefined,
        title: s.title,
        kind: "schedule",
        caseId: s.caseId,
        caseTitle: info.title,
        caseType: info.type,
        overdue: date < today,
        source: "store",
      });
    }
    for (const v of vaultItems) {
      const date = v.date.slice(0, 10);
      const c = v.caseId ? caseMap.get(v.caseId) : undefined;
      out.push({
        id: `vault:${v.filePath}`,
        date,
        // vault 的 time 可能是 "H:mm"，补齐前导零保证字符串排序正确
        time: v.time ? v.time.padStart(5, "0") : undefined,
        title: v.title,
        kind: v.kind,
        caseId: v.caseId ?? "",
        caseTitle: c?.title ?? caseNameFromPath(v.filePath),
        caseType: c?.type ?? "litigation",
        overdue: date < today,
        source: "vault",
      });
    }
    return out;
  }, [cases, tasks, deadlines, schedules, vaultItems, today]);

  const itemHref = (item: DateItem): string =>
    item.source === "vault"
      ? `/board/${item.caseId}?cwd=${encodeURIComponent(cwd)}`
      : item.kind === "task"
        ? `/task/${item.taskId}?cwd=${encodeURIComponent(cwd)}`
        : `/board/${item.caseId}?cwd=${encodeURIComponent(cwd)}`;

  const itemKey = (item: DateItem): string => `${item.kind}-${item.id}`;

  // 窗口：[最早逾期, 今天 +60 天]；逾期项折入「今天」组
  const limitStr = dateString(addDays(parseDate(today), 60));
  const truncated = !expanded && items.some((i) => i.date > limitStr);
  const dayGroups = useMemo(() => {
    const visible = expanded ? items : items.filter((i) => i.date <= limitStr);
    const groups = new Map<string, DateItem[]>();
    for (const item of visible) {
      const key = item.date < today ? today : item.date;
      const arr = groups.get(key);
      if (arr) arr.push(item);
      else groups.set(key, [item]);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
      });
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, expanded, today, limitStr]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, DateItem[]>();
    for (const item of items) {
      const arr = map.get(item.date);
      if (arr) arr.push(item);
      else map.set(item.date, [item]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
    }
    return map;
  }, [items]);

  // 周视图：本周周一 ± weekOffset
  const weekDays = useMemo(() => {
    const t = parseDate(today);
    const monday = addDays(t, -((t.getDay() + 6) % 7) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => dateString(addDays(monday, i)));
  }, [today, weekOffset]);

  // 月视图：本月 ± monthOffset，固定 6 行 × 7 列（周一开头）
  const monthGrid = useMemo(() => {
    const base = parseDate(today);
    const first = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    return {
      label: `${first.getFullYear()} 年 ${first.getMonth() + 1} 月`,
      month: first.getMonth(),
      cells: Array.from({ length: 42 }, (_, i) => dateString(addDays(start, i))),
    };
  }, [today, monthOffset]);

  // 月视图点选某天：切回列表并滚动到对应日组
  useEffect(() => {
    if (view !== "list" || !anchorDate) return;
    const el = document.getElementById(`day-${anchorDate}`);
    if (el) el.scrollIntoView({ block: "start" });
    setAnchorDate(null);
  }, [view, anchorDate, dayGroups]);

  const jumpToDay = (date: string) => {
    if (!expanded && date > limitStr) setExpanded(true);
    setAnchorDate(date);
    changeView("list");
  };

  const boardHref =
    project?.caseId
      ? `/board/${project.caseId}?cwd=${encodeURIComponent(project.cwd)}`
      : "/board";

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

  if (resolved === "empty") {
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
        <span style={{ ...MICRO, color: "var(--text-dim)" }}>Dates</span>
        <span style={{ fontSize: 20, fontWeight: 700 }}>暂无项目</span>
        <Link href="/" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          返回首页发起任务 →
        </Link>
      </div>,
    );
  }
  if (error) {
    return shell(
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 12, color: "var(--accent)" }}>加载失败</span>
      </div>,
    );
  }
  if (resolved === "pending" || !cases || !tasks || !deadlines || !schedules || !vaultItems) {
    return shell(<CenteredNote text="加载中…" />);
  }

  const navButton: CSSProperties = {
    ...MICRO,
    padding: "4px 10px",
    border: "1px solid var(--border)",
    borderRadius: 2,
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  };

  return shell(
    <main style={{ flex: 1, overflowY: "auto", padding: 28 }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* 标题 + 视图切换 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 18,
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>
            全局日程与期限
          </h1>
          <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 2 }}>
            {(
              [
                ["list", "列表"],
                ["week", "周"],
                ["month", "月"],
              ] as Array<[ViewMode, string]>
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => changeView(v)}
                style={{
                  ...MICRO,
                  padding: "6px 14px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: view === v ? "var(--text)" : "var(--text-muted)",
                  // longhand only — mixing the textDecoration shorthand with
                  // textDecorationColor/Thickness trips React's style warning
                  textDecorationLine: view === v ? "underline" : "none",
                  textDecorationColor: "var(--accent)",
                  textUnderlineOffset: 5,
                  textDecorationThickness: 2,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 类别图例 */}
        <div style={{ ...MICRO, color: "var(--text-dim)", display: "flex", gap: 14, marginBottom: 20 }}>
          {(Object.keys(KIND_LABEL) as Array<DateItem["kind"]>).map((kind) => (
            <span key={kind}>
              <span style={{ color: KIND_TICK[kind] }}>■</span> {KIND_LABEL[kind]}
            </span>
          ))}
          <span>
            <span style={{ color: "var(--text-dim)" }}>□</span> 文件库
          </span>
        </div>

        {/* ============ 列表（时间线） ============ */}
        {view === "list" &&
          (dayGroups.length === 0 ? (
            <div style={{ ...MICRO, color: "var(--text-dim)", padding: "40px 0", textAlign: "center" }}>
              暂无日程与期限
            </div>
          ) : (
            <>
              {dayGroups.map(([date, groupItems]) => (
                <section key={date} id={`day-${date}`} style={{ marginBottom: 26, scrollMarginTop: 20 }}>
                  <h2
                    style={{
                      ...MICRO,
                      color: "var(--text-dim)",
                      display: "flex",
                      justifyContent: "space-between",
                      paddingBottom: 8,
                      borderBottom: "2px solid var(--text)",
                      margin: 0,
                    }}
                  >
                    <span>
                      {date === today ? `今天 · ${formatMD(date)}` : `${formatMD(date)} · ${weekdayLabel(date)}`}
                    </span>
                    <span>{groupItems.length} 项</span>
                  </h2>
                  {groupItems.map((item) => {
                    const key = itemKey(item);
                    const overdueDays = item.overdue ? diffDays(today, item.date) : 0;
                    const isVault = item.source === "vault";
                    const rowStyle: CSSProperties = {
                      display: "grid",
                      gridTemplateColumns: "72px 1fr auto",
                      gap: 14,
                      padding: "11px 0",
                      borderBottom: "1px solid var(--border)",
                      alignItems: "baseline",
                      textDecoration: "none",
                      color: "var(--text)",
                    };
                    const row = (
                      <>
                        <span
                          style={{
                            fontSize: 11,
                            fontVariantNumeric: "tabular-nums",
                            color: item.overdue ? "var(--accent)" : "var(--text-dim)",
                            fontWeight: item.overdue ? 700 : 400,
                          }}
                        >
                          {item.overdue ? `逾期 ${overdueDays} 天` : (item.time ?? "全天")}
                        </span>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: !isVault && hoveredKey === key ? "var(--accent)" : "var(--text)",
                            transition: "color .12s",
                          }}
                        >
                          {isVault && <span style={VAULT_MARK}>文</span>}
                          {item.title}
                        </span>
                        <span
                          style={{
                            ...MICRO,
                            letterSpacing: "0.06em",
                            color: "var(--text-muted)",
                            border: "1px solid var(--border)",
                            borderRadius: 2,
                            padding: "2px 6px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.caseTitle}
                        </span>
                      </>
                    );
                    // 无归属案件的 vault 条目无处可去，渲染为不可点击
                    return isVault && !item.caseId ? (
                      <div key={key} style={{ ...rowStyle, cursor: "default" }}>
                        {row}
                      </div>
                    ) : (
                      <Link
                        key={key}
                        href={itemHref(item)}
                        onMouseEnter={() => setHoveredKey(key)}
                        onMouseLeave={() => setHoveredKey(null)}
                        style={rowStyle}
                      >
                        {row}
                      </Link>
                    );
                  })}
                </section>
              ))}
              {truncated && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  style={{
                    ...MICRO,
                    padding: "12px 0",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  + 显示更多
                </button>
              )}
            </>
          ))}

        {/* ============ 周 ============ */}
        {view === "week" && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <span style={{ ...MICRO, color: "var(--text-dim)" }}>
                {formatMD(weekDays[0])} – {formatMD(weekDays[6])}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => setWeekOffset((n) => n - 1)} style={navButton}>
                  ‹
                </button>
                <button type="button" onClick={() => setWeekOffset((n) => n + 1)} style={navButton}>
                  ›
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12 }}>
              {weekDays.map((date) => {
                const dayItems = itemsByDate.get(date) ?? [];
                const d = parseDate(date);
                return (
                  <section key={date}>
                    <h3
                      style={{
                        ...MICRO,
                        margin: 0,
                        paddingBottom: 8,
                        borderBottom: "1px solid var(--border)",
                        color: date === today ? "var(--accent)" : "var(--text-dim)",
                      }}
                    >
                      {d.getMonth() + 1}/{d.getDate()} 周{WEEKDAYS[(d.getDay() + 6) % 7]}
                    </h3>
                    {dayItems.map((item) => {
                      const isVault = item.source === "vault";
                      const cardStyle: CSSProperties = {
                        display: "block",
                        border: "1px solid var(--border)",
                        // inset shadow, not borderLeft — never conflicts with
                        // the border shorthand (same React warning as CaseBoardView)
                        boxShadow: `inset 3px 0 0 ${KIND_TICK[item.kind]}`,
                        borderRadius: 2,
                        padding: "6px 8px",
                        marginTop: 6,
                        background: "var(--bg)",
                        color: "var(--text)",
                        textDecoration: "none",
                      };
                      const card = (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
                            {item.time && (
                              <span style={{ color: "var(--text-dim)", fontWeight: 400, marginRight: 6 }}>
                                {item.time}
                              </span>
                            )}
                            {isVault && <span style={VAULT_MARK}>文</span>}
                            {item.title}
                          </div>
                          <div style={{ ...MICRO, letterSpacing: "0.06em", color: "var(--text-dim)", marginTop: 4 }}>
                            {isVault && !item.caseId
                              ? item.caseTitle
                              : `${CASE_TYPE_LABEL[item.caseType]} · ${item.caseTitle}`}
                          </div>
                        </>
                      );
                      // 无归属案件的 vault 条目无处可去，渲染为不可点击
                      return isVault && !item.caseId ? (
                        <div key={itemKey(item)} style={{ ...cardStyle, cursor: "default" }}>
                          {card}
                        </div>
                      ) : (
                        <Link key={itemKey(item)} href={itemHref(item)} style={cardStyle}>
                          {card}
                        </Link>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </>
        )}

        {/* ============ 月 ============ */}
        {view === "month" && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <span style={{ ...MICRO, color: "var(--text-dim)" }}>{monthGrid.label}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => setMonthOffset((n) => n - 1)} style={navButton}>
                  ‹
                </button>
                <button type="button" onClick={() => setMonthOffset((n) => n + 1)} style={navButton}>
                  ›
                </button>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                marginBottom: 4,
              }}
            >
              {WEEKDAYS.map((w) => (
                <span
                  key={w}
                  style={{ ...MICRO, color: "var(--text-dim)", textAlign: "center", paddingBottom: 6 }}
                >
                  {w}
                </span>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 1,
                background: "var(--border)",
                border: "1px solid var(--border)",
              }}
            >
              {monthGrid.cells.map((date) => {
                const d = parseDate(date);
                const inMonth = d.getMonth() === monthGrid.month;
                const dayItems = itemsByDate.get(date) ?? [];
                const shown = dayItems.slice(0, 3);
                const overflow = dayItems.length - shown.length;
                return (
                  <div
                    key={date}
                    onClick={() => jumpToDay(date)}
                    style={{
                      background: "var(--bg)",
                      minHeight: 92,
                      padding: "6px 8px",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: date === today ? 700 : 400,
                        color: date === today
                          ? "var(--accent)"
                          : inMonth
                            ? "var(--text)"
                            : "var(--text-dim)",
                      }}
                    >
                      {d.getDate()}
                    </div>
                    {shown.map((item) => {
                      const isVault = item.source === "vault";
                      const pillStyle: CSSProperties = {
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginTop: 3,
                        fontSize: 11,
                        lineHeight: 1.3,
                        textDecoration: "none",
                        color: item.kind === "deadline" ? "var(--accent)" : "var(--text)",
                      };
                      const pill = (
                        <>
                          <span
                            style={{
                              flexShrink: 0,
                              width: 4,
                              height: 4,
                              background: KIND_TICK[item.kind],
                            }}
                          />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {isVault && <span style={{ color: "var(--text-dim)" }}>文 </span>}
                            {item.title}
                          </span>
                        </>
                      );
                      // 无归属案件的 vault 条目无处可去，渲染为不可点击
                      return isVault && !item.caseId ? (
                        <div key={itemKey(item)} style={{ ...pillStyle, cursor: "default" }}>
                          {pill}
                        </div>
                      ) : (
                        <Link
                          key={itemKey(item)}
                          href={itemHref(item)}
                          onClick={(e) => e.stopPropagation()}
                          style={pillStyle}
                        >
                          {pill}
                        </Link>
                      );
                    })}
                    {overflow > 0 && (
                      <div style={{ ...MICRO, letterSpacing: "0.06em", color: "var(--text-dim)", marginTop: 3 }}>
                        +{overflow}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>,
  );
}
