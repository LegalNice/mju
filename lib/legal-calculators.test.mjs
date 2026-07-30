import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  filingFee,
  preservationFee,
  executionFee,
  lawyerFee,
  simpleInterest,
  latePaymentInterest,
  amountToChinese,
  calculate,
} = await jiti.import("./legal-calculators.ts");

test("filingFee hits the 50 yuan floor below 1万", () => {
  const r = filingFee(500);
  assert.equal(r.fee, 50);
  assert.equal(r.floored, true);
  assert.equal(r.halved, 25);
});

test("filingFee calculates 10万 at the 1–10万 bracket", () => {
  // 100000 × 2.5% − 200 = 2300
  const r = filingFee(100_000);
  assert.equal(r.fee, 2300);
  assert.equal(r.halved, 1150);
});

test("filingFee calculates 100万 at the 50–100万 bracket ceiling", () => {
  // 100万是 50–100万档上界：1000000 × 1% − 3800 = 6200
  assert.equal(filingFee(1_000_000).fee, 6200);
  // 进入下一档用 1,000,001：≈ 1,000,001 × 0.9% − 4800 = 4200.009 → 4200.01
  assert.equal(filingFee(1_000_001).fee, 4200.01);
});

test("filingFee calculates the >2000万 top bracket", () => {
  // 30000000 × 0.5% − 41800 = 150000 − 41800 = 108200
  assert.equal(filingFee(30_000_000).fee, 108_200);
});

test("filingFee halves for simplified/mediation/withdrawal", () => {
  // 直接调用：fee 为全额，halved 为半额
  const r = filingFee(100_000, { half: true });
  assert.equal(r.fee, 2300);
  assert.equal(r.halved, 1150);
  // calculate 入口：half=true 时主结果取半额
  assert.equal(calculate("filingFee", { amount: 100_000, half: true }).fee, 1150);
});

test("preservationFee caps at 5000", () => {
  // 1亿标的：30 + (100000-1000)*1% + (100000000-100000)*0.5% ≈ 500020.5 → 封顶 5000
  const r = preservationFee(100_000_000);
  assert.equal(r.fee, 5000);
  assert.equal(r.capped, true);
});

test("preservationFee small amount is 30", () => {
  assert.equal(preservationFee(500).fee, 30);
  assert.equal(preservationFee(1000).fee, 30);
});

test("executionFee brackets (progressive accumulation)", () => {
  // ≤1万 = 50
  assert.equal(executionFee(5000).fee, 50);
  // 50万：50 + (50万-1万)×1.5% = 50 + 7350 = 7400
  assert.equal(executionFee(500_000).fee, 7400);
  // 100万：7400 + (100万-50万)×1% = 7400 + 5000 = 12400
  assert.equal(executionFee(1_000_000).fee, 12_400);
  // 600万：12400 + (500万-100万)×1% + (600万-500万)×0.5% = 12400+40000+5000 = 57400
  assert.equal(executionFee(6_000_000).fee, 57_400);
});

test("latePaymentInterest: 100万 × 0.000175 × 100天 = 17500", () => {
  assert.equal(latePaymentInterest(1_000_000, 100), 17_500);
});

test("simpleInterest formula", () => {
  // 100000 × 0.03 × 365 / 365 = 3000
  assert.equal(simpleInterest(100_000, 0.03, 365), 3000);
});

test("lawyerFee returns base range within 20万", () => {
  const r = lawyerFee(150_000);
  assert.equal(r.low, 6000);
  assert.equal(r.high, 50_000);
});

test("amountToChinese handles edge cases", () => {
  assert.equal(amountToChinese(0.01), "壹分");
  assert.equal(amountToChinese(0), "零元整");
  assert.equal(amountToChinese(1001), "壹仟零壹元整");
  assert.equal(amountToChinese(100_000), "壹拾万元整");
  assert.equal(amountToChinese(1234.56), "壹仟贰佰叁拾肆元伍角陆分");
});

test("calculate unified entry routes each tool", () => {
  assert.equal(calculate("filingFee", { amount: 100_000 }).fee, 2300);
  assert.equal(calculate("latePaymentInterest", { principal: 1_000_000, days: 100 }).interest, 17_500);
  assert.equal(calculate("amountToChinese", { amount: 0 }).chinese, "零元整");
});
