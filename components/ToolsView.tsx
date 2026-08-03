"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { AppNav } from "./AppNav";
import { useI18n } from "./I18nProvider";
import {
  filingFee,
  preservationFee,
  executionFee,
  lawyerFee,
  simpleInterest,
  latePaymentInterest,
  amountToChinese,
  type LawyerFeeTier,
} from "@/lib/legal-calculators";
import { addDays, diffDays, todayString } from "@/lib/date-utils";

const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const YUAN = 10_000;
const WAN = (n: number) => n * YUAN;

type ToolId = "filing" | "lawyer" | "interest" | "date" | "amount";

export function ToolsView() {
  const { text: tr } = useI18n();
  const params = useSearchParams();
  const cwd = params.get("cwd") ?? undefined;
  const boardHref = cwd ? `/board?cwd=${encodeURIComponent(cwd)}` : "/board";
  const [tool, setTool] = useState<ToolId>("filing");

  const tools: Array<{ id: ToolId; label: string; en: string }> = [
    { id: "filing", label: "诉讼费", en: "Filing fee" },
    { id: "lawyer", label: "律师费", en: "Lawyer fee" },
    { id: "interest", label: "利息", en: "Interest" },
    { id: "date", label: "日期", en: "Date" },
    { id: "amount", label: "金额大写", en: "Amount" },
  ];

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
      <main style={{ flex: 1, overflowY: "auto", padding: 28 }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 18,
            }}
          >
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{tr("法律计算", "Legal calculators")}</h1>
            <span style={{ ...MICRO, color: "var(--text-dim)" }}>{tr("确定性结果", "Deterministic")}</span>
          </div>
          {/* 工具 Tab */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
            {tools.map((t) => {
              const on = tool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  style={{
                    ...MICRO,
                    padding: "6px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 2,
                    background: on ? "var(--text)" : "transparent",
                    color: on ? "var(--bg)" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {tr(t.label, t.en)}
                </button>
              );
            })}
          </div>
          {content}
        </div>
      </main>
    </div>
  );

  if (!cwd) {
    // 工具不依赖项目，但保留一个返回入口提示
    void 0;
  }

  switch (tool) {
    case "filing":
      return shell(<FilingCalculator tr={tr} />);
    case "lawyer":
      return shell(<LawyerCalculator tr={tr} />);
    case "interest":
      return shell(<InterestCalculator tr={tr} />);
    case "date":
      return shell(<DateCalculator tr={tr} />);
    case "amount":
      return shell(<AmountCalculator tr={tr} />);
  }
}

type Tr = (zh: string, en: string) => string;

// ──────────────────────────── 共享控件 ────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ ...MICRO, color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 2,
  background: "var(--bg-panel)",
  color: "var(--text)",
  fontSize: 14,
  fontFamily: "var(--font-mono)",
  width: "100%",
  outline: "none",
};

const resultBox: CSSProperties = {
  marginTop: 20,
  padding: 16,
  border: "1px solid var(--border)",
  borderRadius: 2,
  background: "var(--bg-panel)",
};

function ResultRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: strong ? 20 : 15,
          fontWeight: strong ? 700 : 400,
          color: strong ? "var(--text)" : "var(--text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function note(text: string) {
  return (
    <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "10px 0 0", lineHeight: 1.6 }}>{text}</p>
  );
}

// ──────────────────────────── 诉讼费 ────────────────────────────

function FilingCalculator({ tr }: { tr: Tr }) {
  const [amount, setAmount] = useState("100000");
  const [half, setHalf] = useState(false);

  const amt = Number(amount) || 0;
  const filing = filingFee(amt);
  const pres = preservationFee(amt);
  const exec = executionFee(amt);
  const fee = half ? filing.halved : filing.fee;

  return (
    <div>
      <Field label={tr("标的额（元）", "Subject amount (CNY)")}>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={inputStyle}
          placeholder="100000"
        />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {tr("减半（简易程序 / 调解 / 撤诉）", "Halved (summary / mediation / withdrawal)")}
        </span>
      </label>
      <div style={resultBox}>
        <ResultRow label={tr("案件受理费", "Filing fee")} value={fmt(fee)} strong />
        {half && <ResultRow label={tr("全额（参考）", "Full (reference)")} value={fmt(filing.fee)} />}
        <ResultRow label={tr("保全费", "Preservation fee") + (pres.capped ? tr("（已封顶）", " (capped)") : "")} value={fmt(pres.fee)} />
        <ResultRow label={tr("申请执行费", "Execution fee")} value={fmt(exec.fee)} />
      </div>
      {note(tr(
        "依据《诉讼费用交纳办法》第十三、十四条。受理费按标的额阶梯速算，下限 50 元；减半情形按半额计。保全费封顶 5000 元。",
        "Per the Litigation Fee Regulations Art. 13–14. Filing fee uses progressive brackets with a 50 floor; halved cases pay half. Preservation fee caps at 5000.",
      ))}
    </div>
  );
}

// ──────────────────────────── 律师费 ────────────────────────────

const DEFAULT_TIERS: LawyerFeeTier[] = [
  { ceiling: WAN(20), low: 0.03, high: 0.25 },
  { ceiling: WAN(100), low: 0.06, high: 0.08 },
  { ceiling: WAN(500), low: 0.04, high: 0.06 },
  { ceiling: WAN(1000), low: 0.02, high: 0.04 },
  { ceiling: WAN(5000), low: 0.01, high: 0.03 },
  { ceiling: WAN(10000), low: 0.005, high: 0.015 },
  { ceiling: Infinity, low: 0.0025, high: 0.01 },
];

function LawyerCalculator({ tr }: { tr: Tr }) {
  const [amount, setAmount] = useState("1000000");
  const [tiers, setTiers] = useState<LawyerFeeTier[]>(DEFAULT_TIERS);

  const amt = Number(amount) || 0;
  const result = useMemo(() => lawyerFee(amt, tiers), [amt, tiers]);

  const updateTier = (i: number, key: "ceiling" | "low" | "high", raw: string) => {
    const v = key === "ceiling" ? Number(raw) || Infinity : Number(raw) || 0;
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: v } : t)));
  };

  return (
    <div>
      <Field label={tr("标的额（元）", "Subject amount (CNY)")}>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} placeholder="1000000" />
      </Field>
      <div style={resultBox}>
        <ResultRow label={tr("律师费下限", "Lawyer fee low")} value={fmt(result.low)} strong />
        <ResultRow label={tr("律师费上限", "Lawyer fee high")} value={fmt(result.high)} strong />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ ...MICRO, color: "var(--text-muted)", marginBottom: 8 }}>{tr("档位（可编辑）", "Brackets (editable)")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tiers.map((tier, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              <input
                type="number"
                value={tier.ceiling === Infinity ? "" : tier.ceiling}
                onChange={(e) => updateTier(i, "ceiling", e.target.value)}
                style={inputStyle}
                placeholder="∞"
                aria-label={tr("档位上限", "ceiling")}
              />
              <input
                type="number"
                step="0.001"
                value={tier.low}
                onChange={(e) => updateTier(i, "low", e.target.value)}
                style={inputStyle}
                aria-label={tr("低档", "low rate")}
              />
              <input
                type="number"
                step="0.001"
                value={tier.high}
                onChange={(e) => updateTier(i, "high", e.target.value)}
                style={inputStyle}
                aria-label={tr("高档", "high rate")}
              />
            </div>
          ))}
        </div>
        <div style={{ ...MICRO, color: "var(--text-dim)", marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <span>{tr("上限", "ceiling")}</span>
          <span>{tr("低档", "low")}</span>
          <span>{tr("高档", "high")}</span>
        </div>
      </div>
      {note(tr(
        "档位为超额累加。各省指导价不同，请按当地标准调整比例。首档为 ≤20 万的基础费 6000–50000/件。",
        "Brackets accumulate progressively. Guideline fees vary by province — adjust rates to local standards. The first bracket is the 6000–50000 base for ≤200k.",
      ))}
    </div>
  );
}

// ──────────────────────────── 利息 ────────────────────────────

function InterestCalculator({ tr }: { tr: Tr }) {
  const [mode, setMode] = useState<"simple" | "late">("simple");
  const [principal, setPrincipal] = useState("1000000");
  const [rate, setRate] = useState("0.03");
  const [start, setStart] = useState(todayString());
  const [end, setEnd] = useState(addDays(todayString(), 365) ?? todayString());

  const days = diffDays(end, start) ?? 0;
  const principalNum = Number(principal) || 0;
  const rateNum = Number(rate) || 0;
  const interest = mode === "simple" ? simpleInterest(principalNum, rateNum, days) : latePaymentInterest(principalNum, days);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["simple", "late"] as const).map((m) => {
          const on = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                ...MICRO,
                padding: "5px 10px",
                border: "1px solid var(--border)",
                borderRadius: 2,
                background: on ? "var(--text)" : "transparent",
                color: on ? "var(--bg)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {m === "simple" ? tr("一般利息", "General") : tr("迟延履行", "Late payment")}
            </button>
          );
        })}
      </div>
      <Field label={tr("本金（元）", "Principal (CNY)")}>
        <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} style={inputStyle} />
      </Field>
      {mode === "simple" && (
        <div style={{ marginTop: 12 }}>
          <Field label={tr("年利率（小数）", "Annual rate (decimal)")}>
            <input type="number" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {[1, 2, 4].map((mul) => (
              <button
                key={mul}
                type="button"
                onClick={() => setRate(String(round4((Number(rate) || 0.03) * mul)))}
                style={{ ...MICRO, padding: "3px 8px", border: "1px solid var(--border)", borderRadius: 2, background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}
              >
                ×{mul}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <Field label={tr("开始日期", "Start date")}>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={tr("结束日期", "End date")}>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <div style={resultBox}>
        <ResultRow label={tr("计息天数", "Days")} value={String(Math.max(0, days))} />
        <ResultRow label={tr("利息", "Interest")} value={fmt(interest)} strong />
      </div>
      {note(
        mode === "simple"
          ? tr(
              "一般利息 = 本金 × 年利率 × 天数 / 365。利率请自行核对最新 LPR。",
              "General interest = principal × annual rate × days / 365. Verify the latest LPR yourself.",
            )
          : tr(
              "迟延履行期间加倍部分债务利息 = 本金 × 日万分之一点七五（0.000175）× 天数。依据《民事诉讼法》。",
              "Late payment interest = principal × 0.0175‰ daily × days. Per Civil Procedure Law.",
            ),
      )}
    </div>
  );
}

// ──────────────────────────── 日期 ────────────────────────────

function DateCalculator({ tr }: { tr: Tr }) {
  const [mode, setMode] = useState<"diff" | "add">("diff");
  const [a, setA] = useState(todayString());
  const [b, setB] = useState(addDays(todayString(), 30) ?? todayString());
  const [base, setBase] = useState(todayString());
  const [offset, setOffset] = useState("15");

  const diff = mode === "diff" ? diffDays(b, a) : null;
  const target = mode === "add" ? addDays(base, Number(offset) || 0) : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["diff", "add"] as const).map((m) => {
          const on = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                ...MICRO,
                padding: "5px 10px",
                border: "1px solid var(--border)",
                borderRadius: 2,
                background: on ? "var(--text)" : "transparent",
                color: on ? "var(--bg)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {m === "diff" ? tr("日期差", "Difference") : tr("日期推算", "Offset")}
            </button>
          );
        })}
      </div>
      {mode === "diff" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={tr("日期 A", "Date A")}>
            <input type="date" value={a} onChange={(e) => setA(e.target.value)} style={inputStyle} />
          </Field>
          <Field label={tr("日期 B", "Date B")}>
            <input type="date" value={b} onChange={(e) => setB(e.target.value)} style={inputStyle} />
          </Field>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={tr("基准日期", "Base date")}>
            <input type="date" value={base} onChange={(e) => setBase(e.target.value)} style={inputStyle} />
          </Field>
          <Field label={tr("± 天数", "± days")}>
            <input type="number" value={offset} onChange={(e) => setOffset(e.target.value)} style={inputStyle} />
          </Field>
        </div>
      )}
      <div style={resultBox}>
        {mode === "diff" ? (
          <ResultRow label={tr("A → B 天数（B 晚为正）", "A → B days (positive if B later)")} value={diff !== null ? String(diff) : "—"} strong />
        ) : (
          <ResultRow label={tr("目标日期", "Target date")} value={target ?? "—"} strong />
        )}
      </div>
      {note(tr("自然日计算，不做工作日扣除。", "Calendar days; business-day exclusion not applied."))}
    </div>
  );
}

// ──────────────────────────── 金额大写 ────────────────────────────

function AmountCalculator({ tr }: { tr: Tr }) {
  const [amount, setAmount] = useState("1234.56");
  const chinese = amountToChinese(Number(amount) || 0);
  return (
    <div>
      <Field label={tr("金额（元）", "Amount (CNY)")}>
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
      </Field>
      <div style={resultBox}>
        <ResultRow label={tr("人民币大写", "RMB in words")} value={chinese} strong />
      </div>
      {note(tr("标准人民币大写规则。整数末尾加「整」。", "Standard RMB uppercase rules. Integers end with 「整」."))}
    </div>
  );
}

// ──────────────────────────── 格式化 ────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
