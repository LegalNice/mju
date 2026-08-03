// 共享日期纯函数：计算引擎、期限推算与视图层统一从这里取。
// 全部基于 YYYY-MM-DD 字符串，不引入时区，不依赖 Date 的本地时区解析歧义。

const MS_PER_DAY = 86_400_000;

/** 把 ISO 日期字符串解析为 UTC 00:00 的 Date，避免本地时区导致的偏移。 */
function toUtcMidnight(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  // 校验真实日期（如 02-30 会被 Date 滚动）
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

/** 判断是否为合法的 YYYY-MM-DD 日期。 */
export function isValidDate(iso: string): boolean {
  return toUtcMidnight(iso) !== null;
}

/** 今天的 ISO 日期。视图层与推算统一用本机当天。 */
export function todayString(): string {
  return toIso(new Date());
}

function toIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 某日期 ± N 天（N 可为负），返回新的 ISO 日期。非法输入返回 null。 */
export function addDays(iso: string, days: number): string | null {
  const base = toUtcMidnight(iso);
  if (!base) return null;
  return toIso(new Date(base.getTime() + days * MS_PER_DAY));
}

/** 某日期 + N 年（可为负），按自然年滚动；月末溢出时回落到当月最后一天
 *  （例如 2024-02-29 +1 年 = 2025-02-28，2024-01-31 +1 年 = 2025-01-31）。 */
export function addYears(iso: string, years: number): string | null {
  const base = toUtcMidnight(iso);
  if (!base) return null;
  const y = base.getUTCFullYear() + years;
  const mo = base.getUTCMonth();
  const d = base.getUTCDate();
  // 当月最后一天
  const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return toIso(new Date(Date.UTC(y, mo, Math.min(d, lastDay))));
}

/** a - b 的天数（a 晚于 b 为正）。任一非法返回 null。 */
export function diffDays(a: string, b: string): number | null {
  const da = toUtcMidnight(a);
  const db = toUtcMidnight(b);
  if (!da || !db) return null;
  return Math.round((da.getTime() - db.getTime()) / MS_PER_DAY);
}

export type Urgency = "overdue" | "soon" | "normal";

/** 到期紧迫度：overdue < 今天；soon 在今天起 7 天内（含今天与第 7 天）。 */
export function getUrgency(dateISO: string, todayISO: string = todayString()): Urgency {
  const diff = diffDays(dateISO, todayISO);
  if (diff === null) return "normal";
  if (diff < 0) return "overdue";
  if (diff <= 7) return "soon";
  return "normal";
}

/** 距今天还剩多少天（负数 = 已逾期 N 天）。非法返回 null。 */
export function daysFromToday(dateISO: string, todayISO: string = todayString()): number | null {
  return diffDays(dateISO, todayISO);
}
