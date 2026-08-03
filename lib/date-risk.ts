import type { Deadline, Schedule, Task } from "./mju-models";

export type DateRiskLevel = "overdue" | "due-today" | "upcoming" | "normal";
export type DateRiskTone = "danger" | "warning" | "muted";
export type DateRiskItemKind = "task" | "deadline" | "schedule";
export type DateRiskLocale = "zh" | "en";

export interface DateRisk {
  date: string;
  daysUntil: number;
  level: DateRiskLevel;
}

export interface DateRiskItem extends DateRisk {
  id: string;
  kind: DateRiskItemKind;
  title: string;
  caseId: string;
  time?: string;
}

interface DateRiskItemInput {
  id: string;
  kind: DateRiskItemKind;
  title: string;
  caseId: string;
  date: string;
  time?: string;
}

export interface DateRiskSources {
  tasks?: readonly Task[];
  deadlines?: readonly Deadline[];
  schedules?: readonly Schedule[];
}

export interface DateRiskOptions {
  /** Defaults to the current local calendar date. */
  today?: Date | string;
  /** Dates this many days away or sooner are marked as upcoming. Defaults to 3. */
  upcomingDays?: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Return a local YYYY-MM-DD value without ISO timezone conversion. */
export function localDateString(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function datePart(value: string): string | undefined {
  const result = value.slice(0, 10);
  return isDateString(result) ? result : undefined;
}

function dateFromSchedule(datetime: string): { date: string; time?: string } | undefined {
  const parsed = new Date(datetime.replace(" ", "T"));
  if (!Number.isNaN(parsed.getTime())) {
    return {
      date: localDateString(parsed),
      time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
    };
  }

  const date = datePart(datetime);
  if (!date) return undefined;
  const time = /^\d{4}-\d{2}-\d{2}[T ](\d{1,2}:\d{2})/.exec(datetime)?.[1];
  return { date, time: time?.padStart(5, "0") };
}

function resolveToday(today?: Date | string): string {
  if (typeof today === "string") {
    if (!isDateString(today)) throw new Error(`Invalid today date: ${today}`);
    return today;
  }
  return localDateString(today ?? new Date());
}

function daysBetween(date: string, today: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  return Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000,
  );
}

/** Calculate the calendar-day risk for a dated item. */
export function calculateDateRisk(date: string, options: DateRiskOptions = {}): DateRisk {
  const normalizedDate = datePart(date);
  if (!normalizedDate) throw new Error(`Invalid date: ${date}`);

  const daysUntil = daysBetween(normalizedDate, resolveToday(options.today));
  const upcomingDays = options.upcomingDays ?? 3;
  if (!Number.isInteger(upcomingDays) || upcomingDays < 0) {
    throw new Error("upcomingDays must be a non-negative integer");
  }

  return {
    date: normalizedDate,
    daysUntil,
    level: daysUntil < 0
      ? "overdue"
      : daysUntil === 0
        ? "due-today"
        : daysUntil <= upcomingDays
          ? "upcoming"
          : "normal",
  };
}

/** Convert a risk level into a presentation-independent visual tone. */
export function dateRiskTone(level: DateRiskLevel): DateRiskTone {
  switch (level) {
    case "overdue":
      return "danger";
    case "due-today":
    case "upcoming":
      return "warning";
    case "normal":
      return "muted";
  }
}

/** Format a YYYY-MM-DD date for the lightweight date labels used by views. */
export function formatRiskDate(date: string, locale: DateRiskLocale = "zh"): string {
  const normalizedDate = datePart(date);
  if (!normalizedDate) return date;
  const [, month, day] = normalizedDate.split("-").map(Number);
  return locale === "en" ? `${month}/${day}` : `${month}月${day}日`;
}

/** Format a concise, localized label for a calculated date risk. */
export function formatDateRisk(risk: DateRisk, locale: DateRiskLocale = "zh"): string {
  if (locale === "en") {
    if (risk.level === "overdue") return `${Math.abs(risk.daysUntil)} days overdue`;
    if (risk.level === "due-today") return "Due today";
    if (risk.level === "upcoming") return `Due in ${risk.daysUntil} days`;
    return formatRiskDate(risk.date, locale);
  }

  if (risk.level === "overdue") return `逾期 ${Math.abs(risk.daysUntil)} 天`;
  if (risk.level === "due-today") return "今日到期";
  if (risk.level === "upcoming") return `${risk.daysUntil} 天后到期`;
  return formatRiskDate(risk.date, locale);
}

/**
 * Merge active task deadlines, open deadlines, and schedules into a single
 * date-risk feed. Completed or cancelled tasks, done deadlines, and invalid
 * dates are omitted. Results are ordered by risk then calendar date and time.
 */
export function aggregateDateRisks(
  { tasks = [], deadlines = [], schedules = [] }: DateRiskSources,
  options: DateRiskOptions = {},
): DateRiskItem[] {
  const items: DateRiskItem[] = [];
  const add = (item: DateRiskItemInput) => {
    const risk = calculateDateRisk(item.date, options);
    items.push({ ...item, ...risk });
  };

  for (const task of tasks) {
    if (task.status === "完成" || task.status === "取消" || !task.deadline) continue;
    const date = datePart(task.deadline);
    if (date) add({ id: task.id, kind: "task", title: task.title, caseId: task.caseId, date });
  }

  for (const deadline of deadlines) {
    if (deadline.status === "done") continue;
    const date = datePart(deadline.date);
    if (date) add({ id: deadline.id, kind: "deadline", title: deadline.title, caseId: deadline.caseId, date });
  }

  for (const schedule of schedules) {
    const scheduleDate = dateFromSchedule(schedule.datetime);
    if (!scheduleDate) continue;
    add({
      id: schedule.id,
      kind: "schedule",
      title: schedule.title,
      caseId: schedule.caseId,
      ...scheduleDate,
    });
  }

  const severity: Record<DateRiskLevel, number> = {
    overdue: 0,
    "due-today": 1,
    upcoming: 2,
    normal: 3,
  };
  return items.sort((left, right) =>
    severity[left.level] - severity[right.level]
    || left.date.localeCompare(right.date)
    || (left.time ?? "99:99").localeCompare(right.time ?? "99:99")
    || left.title.localeCompare(right.title),
  );
}
