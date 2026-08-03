import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  classifyMaterial,
  classifyMaterials,
  extractDates,
  inferDeadlines,
  summarizeClassifications,
} = await jiti.import("./material-intelligence.ts");

test("extractDates finds ISO dates in file names", () => {
  assert.deepEqual(extractDates("合同-2026-08-10.pdf"), ["2026-08-10"]);
  assert.deepEqual(extractDates("2026-07-25_会议纪要.md"), ["2026-07-25"]);
  assert.deepEqual(extractDates("无日期文件.txt"), []);
  assert.deepEqual(extractDates("a-2026-01-01-b-2026-02-02.zip"), ["2026-01-01", "2026-02-02"]);
});

test("classifyMaterial recognizes pleadings and court documents", () => {
  const pleading = classifyMaterial("/case/材料/原告起诉状-2026-08-01.md");
  assert.equal(pleading.category, "pleading");
  assert.equal(pleading.suggestedFolder, "文书");
  assert.equal(pleading.confidence, "high");
  assert.deepEqual(pleading.extractedDates, ["2026-08-01"]);

  const court = classifyMaterial("/case/材料/民事判决书.pdf");
  assert.equal(court.category, "court_document");
  assert.equal(court.suggestedFolder, "材料");

  const contract = classifyMaterial("/case/材料/采购合同.docx");
  assert.equal(contract.category, "contract");
  assert.equal(contract.suggestedFolder, "材料");

  const analysis = classifyMaterial("/case/材料/法律检索报告.md");
  assert.equal(analysis.category, "analysis");
  assert.equal(analysis.suggestedFolder, "分析");
});

test("classifyMaterial falls back to other for unknown files", () => {
  const other = classifyMaterial("/case/材料/unknown.txt");
  assert.equal(other.category, "other");
  assert.equal(other.suggestedFolder, "材料");
  assert.equal(other.confidence, "low");
});

test("classifyMaterials handles multiple files", () => {
  const result = classifyMaterials([
    "/case/材料/起诉状.md",
    "/case/材料/合同.pdf",
    "/case/材料/截图.png",
  ]);
  assert.equal(result.length, 3);
  assert.equal(result[0].category, "pleading");
  assert.equal(result[1].category, "contract");
  assert.equal(result[2].category, "evidence");
});

test("inferDeadlines projects judgment appeal window (+15d) with basis in title", () => {
  const classifications = [
    classifyMaterial("/case/材料/判决书-2026-08-15.pdf"),
    classifyMaterial("/case/材料/合同-2026-08-10.docx"),
  ];
  const deadlines = inferDeadlines(classifications);
  assert.equal(deadlines.length, 1);
  // 判决书日期 +15 日推算上诉期届满
  assert.equal(deadlines[0].date, "2026-08-30");
  assert.equal(deadlines[0].type, "court");
  assert.match(deadlines[0].title, /上诉期届满/);
  assert.match(deadlines[0].title, /送达日/);
});

test("inferDeadlines projects ruling window (+10d)", () => {
  const deadlines = inferDeadlines([classifyMaterial("/case/材料/裁定书-2026-09-01.pdf")]);
  assert.equal(deadlines.length, 1);
  assert.equal(deadlines[0].date, "2026-09-11");
  assert.match(deadlines[0].title, /裁定/);
});

test("inferDeadlines projects preservation renewal (+1y)", () => {
  const deadlines = inferDeadlines([classifyMaterial("/case/材料/保全裁定书-2026-07-30.pdf")]);
  assert.equal(deadlines.length, 1);
  assert.equal(deadlines[0].date, "2027-07-30");
  assert.match(deadlines[0].title, /续封/);
});

test("inferDeadlines stays conservative for low-confidence or undated files", () => {
  const deadlines = inferDeadlines([
    classifyMaterial("/case/材料/证据.png"), // low confidence
    classifyMaterial("/case/材料/判决书.pdf"), // high confidence but no date
  ]);
  assert.equal(deadlines.length, 0);
});

test("summarizeClassifications produces a readable report", () => {
  const report = summarizeClassifications([
    classifyMaterial("/case/材料/起诉状.md"),
    classifyMaterial("/case/材料/合同-2026-08-10.docx"),
  ]);
  assert.match(report, /起诉状/);
  assert.match(report, /合同/);
  assert.match(report, /2026-08-10/);
});
