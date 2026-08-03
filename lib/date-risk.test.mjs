import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  aggregateDateRisks,
  calculateDateRisk,
  dateRiskTone,
  formatDateRisk,
  formatRiskDate,
} = await jiti.import("./date-risk.ts");

const createdAt = "2026-07-01T00:00:00.000Z";

function task(overrides = {}) {
  return {
    id: "task-1",
    caseId: "case-1",
    title: "Task",
    detail: "",
    assignee: "Justice",
    status: "待办",
    createdAt,
    ...overrides,
  };
}

function deadline(overrides = {}) {
  return {
    id: "deadline-1",
    caseId: "case-1",
    title: "Deadline",
    date: "2026-08-02",
    type: "court",
    status: "pending",
    createdAt,
    ...overrides,
  };
}

function schedule(overrides = {}) {
  return {
    id: "schedule-1",
    caseId: "case-1",
    title: "Schedule",
    datetime: "2026-08-02T09:30:00",
    type: "court-hearing",
    createdAt,
    ...overrides,
  };
}

test("calculateDateRisk classifies overdue, today, upcoming, and normal dates", () => {
  const options = { today: "2026-08-02", upcomingDays: 3 };

  assert.deepEqual(calculateDateRisk("2026-08-01", options), {
    date: "2026-08-01",
    daysUntil: -1,
    level: "overdue",
  });
  assert.equal(calculateDateRisk("2026-08-02", options).level, "due-today");
  assert.equal(calculateDateRisk("2026-08-05", options).level, "upcoming");
  assert.equal(calculateDateRisk("2026-08-06", options).level, "normal");
});

test("aggregateDateRisks merges all date sources and omits inactive work", () => {
  const risks = aggregateDateRisks({
    tasks: [
      task({ id: "active-task", title: "Active task", deadline: "2026-08-03" }),
      task({ id: "completed-task", title: "Completed task", deadline: "2026-08-01", status: "完成" }),
      task({ id: "cancelled-task", title: "Cancelled task", deadline: "2026-08-01", status: "取消" }),
      task({ id: "undated-task", title: "Undated task" }),
    ],
    deadlines: [
      deadline({ id: "open-deadline", title: "Open deadline", date: "2026-08-01" }),
      deadline({ id: "done-deadline", title: "Done deadline", date: "2026-08-01", status: "done" }),
    ],
    schedules: [
      schedule({ id: "hearing", title: "Hearing", datetime: "2026-08-02T09:30:00" }),
      schedule({ id: "invalid", title: "Invalid", datetime: "not-a-date" }),
    ],
  }, { today: "2026-08-02" });

  assert.deepEqual(risks.map(({ id, kind, date, time, level }) => ({ id, kind, date, time, level })), [
    { id: "open-deadline", kind: "deadline", date: "2026-08-01", time: undefined, level: "overdue" },
    { id: "hearing", kind: "schedule", date: "2026-08-02", time: "09:30", level: "due-today" },
    { id: "active-task", kind: "task", date: "2026-08-03", time: undefined, level: "upcoming" },
  ]);
});

test("aggregateDateRisks keeps same-day schedules in time order", () => {
  const risks = aggregateDateRisks({
    schedules: [
      schedule({ id: "later", datetime: "2026-08-02 14:00:00" }),
      schedule({ id: "earlier", datetime: "2026-08-02 09:00:00" }),
    ],
  }, { today: "2026-08-02" });

  assert.deepEqual(risks.map((risk) => [risk.id, risk.time]), [
    ["earlier", "09:00"],
    ["later", "14:00"],
  ]);
});

test("date-risk display helpers return localized labels and tones", () => {
  const overdue = calculateDateRisk("2026-08-01", { today: "2026-08-02" });
  const upcoming = calculateDateRisk("2026-08-04", { today: "2026-08-02" });

  assert.equal(dateRiskTone(overdue.level), "danger");
  assert.equal(dateRiskTone(upcoming.level), "warning");
  assert.equal(formatDateRisk(overdue), "逾期 1 天");
  assert.equal(formatDateRisk(upcoming, "en"), "Due in 2 days");
  assert.equal(formatRiskDate("2026-08-12"), "8月12日");
  assert.equal(formatRiskDate("2026-08-12", "en"), "8/12");
});
