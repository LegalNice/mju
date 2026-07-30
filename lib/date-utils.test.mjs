import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { addDays, addYears, diffDays, getUrgency, isValidDate } =
  await jiti.import("./date-utils.ts");

test("addDays moves forward and backward", () => {
  assert.equal(addDays("2026-01-01", 15), "2026-01-16");
  assert.equal(addDays("2026-01-16", -15), "2026-01-01");
  // 跨月跨年
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("addYears handles month-end overflow (Feb 29)", () => {
  // 闰年 2 月 29 日 +1 年 → 非闰年回落到 2 月 28 日
  assert.equal(addYears("2024-02-29", 1), "2025-02-28");
  // 1 月 31 日 +1 年 → 1 月 31 日（不溢出）
  assert.equal(addYears("2024-01-31", 1), "2025-01-31");
  assert.equal(addYears("2026-07-30", 1), "2027-07-30");
});

test("diffDays counts day spans", () => {
  assert.equal(diffDays("2026-01-16", "2026-01-01"), 15);
  assert.equal(diffDays("2026-01-01", "2026-01-16"), -15);
});

test("getUrgency boundaries", () => {
  const today = "2026-07-30";
  assert.equal(getUrgency("2026-07-29", today), "overdue"); // 昨天
  assert.equal(getUrgency("2026-07-30", today), "soon"); // 今天
  assert.equal(getUrgency("2026-08-06", today), "soon"); // 第 7 天（含）
  assert.equal(getUrgency("2026-08-07", today), "normal"); // 第 8 天
});

test("isValidDate rejects impossible dates", () => {
  assert.equal(isValidDate("2026-02-30"), false);
  assert.equal(isValidDate("2026-13-01"), false);
  assert.equal(isValidDate("2026-07-30"), true);
});
