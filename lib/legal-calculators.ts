// 确定性法律计算引擎：诉讼费、律师费、利息、日期、金额大写。
// 全部为纯函数，费率表为导出常量。Agent 写文书时应通过 /api/calc 调用，
// 不得自行口算。依据《诉讼费用交纳办法》及民事诉讼法相关司法解释。

export interface Bracket {
  /** 该档上限（含），Infinity 表示封顶档。单位：元。 */
  ceiling: number;
  /** 该档内金额适用的比例（0–1）。 */
  rate: number;
  /** 速算扣除数：结果 = 标的额 × rate − deduct（用于案件受理费阶梯）。可选。 */
  deduct?: number;
}

// ──────────────────────────── 诉讼费 ────────────────────────────

/** 案件受理费阶梯（《诉讼费用交纳办法》第十三条）。结果 = 标的 × rate − deduct，下限 50。 */
export const FILING_FEE_BRACKETS: Bracket[] = [
  { ceiling: 10_000, rate: 0, deduct: 0 },
  { ceiling: 100_000, rate: 0.025, deduct: 200 },
  { ceiling: 200_000, rate: 0.02, deduct: 300 },
  { ceiling: 500_000, rate: 0.015, deduct: 1300 },
  { ceiling: 1_000_000, rate: 0.01, deduct: 3800 },
  { ceiling: 2_000_000, rate: 0.009, deduct: 4800 },
  { ceiling: 5_000_000, rate: 0.008, deduct: 6800 },
  { ceiling: 10_000_000, rate: 0.007, deduct: 11_800 },
  { ceiling: 20_000_000, rate: 0.006, deduct: 21_800 },
  { ceiling: Infinity, rate: 0.005, deduct: 41_800 },
];

export interface FilingFeeResult {
  fee: number;
  halved: number;
  /** 命中的档位说明。 */
  bracket: string;
  /** 是否触及下限。 */
  floored: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pickBracket(amount: number, brackets: Bracket[]): Bracket {
  return brackets.find((b) => amount <= b.ceiling) ?? brackets[brackets.length - 1];
}

/** 计算案件受理费。amount 为标的额（元）。 */
export function filingFee(amount: number, { half = false } = {}): FilingFeeResult {
  const a = Math.max(0, amount);
  const bracket = pickBracket(a, FILING_FEE_BRACKETS);
  let fee = a * bracket.rate - (bracket.deduct ?? 0);
  let floored = false;
  if (fee < 50) {
    fee = 50;
    floored = true;
  }
  fee = round2(fee);
  return {
    fee,
    halved: round2(fee / 2),
    bracket: bracketLabel(bracket, FILING_FEE_BRACKETS),
    floored,
    // half 仅作为输出字段返回，不改变主 fee；调用方取 halved 即可
    ...(half ? {} : {}),
  };
}

function bracketLabel(bracket: Bracket, all: Bracket[]): string {
  const idx = all.indexOf(bracket);
  const lower = idx > 0 ? all[idx - 1].ceiling : 0;
  const upper = bracket.ceiling === Infinity ? Infinity : bracket.ceiling;
  return `${fmt(lower)}–${upper === Infinity ? "以上" : fmt(upper)} 元档`;
}

// ──────────────────────────── 保全费 ────────────────────────────

/** 保全费（《诉讼费用交纳办法》第十四条）：封顶 5000。 */
export function preservationFee(amount: number): { fee: number; capped: boolean } {
  const a = Math.max(0, amount);
  if (a <= 1000) return { fee: 30, capped: false };
  let fee = 30 + (Math.min(a, 100_000) - 1000) * 0.01;
  if (a > 100_000) fee += (a - 100_000) * 0.005;
  fee = round2(fee);
  const capped = fee > 5000;
  return { fee: Math.min(fee, 5000), capped };
}

// ──────────────────────────── 申请执行费 ────────────────────────────

/** 执行申请费档位（《诉讼费用交纳办法》第十四条，超额累加）。
 *  ceiling 为该档上限（含），rate 为该档内超额部分适用比例，floor 为该档固定基础（≤1万档为 50）。 */
export interface ExecutionTier {
  ceiling: number;
  rate: number;
  floor: number;
}

export const EXECUTION_FEE_TIERS: ExecutionTier[] = [
  { ceiling: 10_000, rate: 0, floor: 50 }, // ≤1万：50
  { ceiling: 500_000, rate: 0.015, floor: 0 }, // 1万–50万部分 1.5%
  { ceiling: 5_000_000, rate: 0.01, floor: 0 }, // 50万–500万部分 1%
  { ceiling: 10_000_000, rate: 0.005, floor: 0 }, // 500万–1000万部分 0.5%
  { ceiling: Infinity, rate: 0.001, floor: 0 }, // >1000万部分 0.1%
];

export function executionFee(amount: number): { fee: number; bracket: string } {
  const a = Math.max(0, amount);
  let fee = EXECUTION_FEE_TIERS[0].floor;
  let prev = EXECUTION_FEE_TIERS[0].ceiling;
  let hitIdx = 0;
  for (let i = 1; i < EXECUTION_FEE_TIERS.length; i++) {
    const tier = EXECUTION_FEE_TIERS[i];
    if (a <= prev) break;
    const seg = Math.min(a, tier.ceiling === Infinity ? a : tier.ceiling) - prev;
    if (seg > 0) fee += seg * tier.rate;
    hitIdx = i;
    prev = tier.ceiling;
    if (tier.ceiling === Infinity || a <= tier.ceiling) break;
  }
  const tier = EXECUTION_FEE_TIERS[hitIdx];
  const lower = hitIdx > 0 ? EXECUTION_FEE_TIERS[hitIdx - 1].ceiling : 0;
  const upper = tier.ceiling === Infinity ? Infinity : tier.ceiling;
  return {
    fee: round2(fee),
    bracket: `${fmt(lower)}–${upper === Infinity ? "以上" : fmt(upper)} 元档`,
  };
}

// ──────────────────────────── 律师费 ────────────────────────────

export interface LawyerFeeTier {
  /** 该档上限（含）。 */
  ceiling: number;
  /** 低档比例与高档比例（0–1）。 */
  low: number;
  high: number;
}

/**
 * 默认律师费档位（参考常见民事一审指导标准，仅作预设，各省不同请自行调整）。
 * 20 万以内为基础费 6000–50000/件；超过部分按阶梯累加。
 */
export const DEFAULT_LAWYER_FEE_TIERS: LawyerFeeTier[] = [
  { ceiling: 200_000, low: 0.03, high: 0.25 }, // 基础档：6000 / 50000
  { ceiling: 1_000_000, low: 0.06, high: 0.08 },
  { ceiling: 5_000_000, low: 0.04, high: 0.06 },
  { ceiling: 10_000_000, low: 0.02, high: 0.04 },
  { ceiling: 50_000_000, low: 0.01, high: 0.03 },
  { ceiling: 100_000_000, low: 0.005, high: 0.015 },
  { ceiling: Infinity, low: 0.0025, high: 0.01 },
];

export interface LawyerFeeResult {
  low: number;
  high: number;
  /** 基础档（≤20万）的固定区间，供调用方参考。 */
  baseLow: number;
  baseHigh: number;
}

/** 按阶梯速算律师费区间。tiers 可由调用方传入自定义档位。 */
export function lawyerFee(amount: number, tiers: LawyerFeeTier[] = DEFAULT_LAWYER_FEE_TIERS): LawyerFeeResult {
  const a = Math.max(0, amount);
  const baseLow = 6000;
  const baseHigh = 50_000;
  if (a <= tiers[0].ceiling) {
    return { low: baseLow, high: baseHigh, baseLow, baseHigh };
  }
  let lowExtra = 0;
  let highExtra = 0;
  let prev = tiers[0].ceiling;
  for (let i = 1; i < tiers.length; i++) {
    const tier = tiers[i];
    if (a <= prev) break;
    const segment = Math.min(a, tier.ceiling === Infinity ? a : tier.ceiling) - prev;
    if (segment <= 0) {
      prev = tier.ceiling;
      if (a <= prev) break;
      continue;
    }
    lowExtra += segment * tier.low;
    highExtra += segment * tier.high;
    prev = tier.ceiling;
    if (a <= tier.ceiling) break;
  }
  return {
    low: round2(baseLow + lowExtra),
    high: round2(baseHigh + highExtra),
    baseLow,
    baseHigh,
  };
}

// ──────────────────────────── 利息 ────────────────────────────

/** 一般利息：本金 × 年利率 × 天数 / 365。rate 以小数表示（3% = 0.03）。 */
export function simpleInterest(
  principal: number,
  annualRate: number,
  days: number,
): number {
  return round2(principal * annualRate * Math.max(0, days) / 365);
}

/** 迟延履行期间加倍部分债务利息（日万分之一点七五）。依据民事诉讼法及最高法司法解释。 */
export const LATE_PAYMENT_DAILY_RATE = 0.000175;

export function latePaymentInterest(principal: number, days: number): number {
  return round2(principal * LATE_PAYMENT_DAILY_RATE * Math.max(0, days));
}

// ──────────────────────────── 金额大写 ────────────────────────────

const DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const UNITS = ["", "拾", "佰", "仟"];
const BIG_UNITS = ["", "万", "亿", "兆"];

function intToChinese(n: number): string {
  if (n === 0) return "零";
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 10_000);
    rest = Math.floor(rest / 10_000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    const bigUnit = BIG_UNITS[i] ?? "";
    if (g === 0) {
      // 整组为零，保留一个"零"用于衔接
      if (parts.length && !parts[parts.length - 1].endsWith("零")) parts.push("零");
      continue;
    }
    const groupStr = fourDigitsToChinese(g);
    parts.push(groupStr + bigUnit);
  }
  // 合并末尾多余零
  return parts.join("").replace(/零+$/, "").replace(/零{2,}/g, "零");
}

function fourDigitsToChinese(g: number): string {
  const digits: number[] = [];
  let rest = g;
  for (let i = 0; i < 4; i++) {
    digits.unshift(rest % 10);
    rest = Math.floor(rest / 10);
  }
  let s = "";
  let nonzeroSeen = false;
  for (let i = 0; i < 4; i++) {
    const d = digits[i];
    const unit = UNITS[3 - i];
    if (d === 0) {
      if (nonzeroSeen) s += "零";
    } else {
      // 壹拾 在最高位时通常省略拾前的"壹"（如 15万 读拾伍万），但金额大写规范保留壹拾更稳妥
      s += DIGITS[d] + unit;
      nonzeroSeen = true;
    }
  }
  return s.replace(/零+$/, "");
}

/** 金额转人民币大写。支持到分；整数末尾加"整"。 */
export function amountToChinese(amount: number): string {
  if (!Number.isFinite(amount)) return "金额无效";
  if (amount < 0) return "负" + amountToChinese(-amount);
  // 以分为单位计算，避免浮点误差
  const rounded = Math.round(amount * 100);
  const intPart = Math.floor(rounded / 100);
  const frac = rounded % 100;
  const jiao = Math.floor(frac / 10);
  const fen = frac % 10;

  const intStr = intToChinese(intPart);
  let result: string;
  if (intPart === 0) {
    result = "";
  } else {
    result = intStr + "元";
  }

  if (jiao === 0 && fen === 0) {
    return (result || "零元") + "整";
  }

  if (jiao === 0 && intPart > 0) {
    result += "零";
  } else if (jiao > 0) {
    result += DIGITS[jiao] + "角";
  }
  if (fen > 0) {
    result += DIGITS[fen] + "分";
  }
  // 整数为 0 且有角分时
  if (intPart === 0) {
    return result;
  }
  return result;
}

// ──────────────────────────── 工具函数 ────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("zh-CN");
}

export type CalcTool =
  | "filingFee"
  | "preservationFee"
  | "executionFee"
  | "lawyerFee"
  | "simpleInterest"
  | "latePaymentInterest"
  | "amountToChinese";

/** 统一计算入口，供 /api/calc 路由调用。返回值结构因工具而异。 */
export function calculate(
  tool: CalcTool,
  params: Record<string, unknown>,
): object {
  switch (tool) {
    case "filingFee": {
      const amount = num(params.amount);
      const half = Boolean(params.half);
      const r = filingFee(amount, { half });
      return half ? { ...r, fee: r.halved } : r;
    }
    case "preservationFee":
      return preservationFee(num(params.amount));
    case "executionFee":
      return executionFee(num(params.amount));
    case "lawyerFee":
      return lawyerFee(num(params.amount));
    case "simpleInterest":
      return {
        interest: simpleInterest(num(params.principal), num(params.annualRate), num(params.days)),
      };
    case "latePaymentInterest":
      return { interest: latePaymentInterest(num(params.principal), num(params.days)) };
    case "amountToChinese":
      return { chinese: amountToChinese(num(params.amount)) };
    default:
      throw new Error(`未知计算工具: ${tool}`);
  }
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || Number.isNaN(n)) throw new Error(`参数不是数字: ${String(v)}`);
  return n;
}
