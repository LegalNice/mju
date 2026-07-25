import { basename } from "node:path";

export type MaterialCategory =
  | "pleading"
  | "court_document"
  | "evidence"
  | "contract"
  | "correspondence"
  | "analysis"
  | "communication"
  | "other";

export interface MaterialClassification {
  fileName: string;
  category: MaterialCategory;
  label: string;
  suggestedFolder: "材料" | "文书" | "分析";
  confidence: "high" | "low";
  extractedDates: string[];
  notes: string;
}

export interface InferredDeadline {
  title: string;
  date: string;
  type: "court" | "filing" | "client" | "internal";
}

const RULES: Array<{
  category: MaterialCategory;
  label: string;
  folder: "材料" | "文书" | "分析";
  confidence: "high" | "low";
  keywords: string[];
  deadlineHint?: string;
  deadlineType?: InferredDeadline["type"];
}> = [
  {
    category: "pleading",
    label: "诉讼文书",
    folder: "文书",
    confidence: "high",
    keywords: ["起诉状", "答辩状", "上诉状", "反诉状", "再审申请", "执行申请", "异议申请"],
  },
  {
    category: "correspondence",
    label: "函件",
    folder: "文书",
    confidence: "high",
    keywords: ["律师函", "催告函", "通知书", "告知函", "联系函", "公函"],
  },
  {
    category: "analysis",
    label: "内部研究",
    folder: "分析",
    confidence: "high",
    keywords: ["检索报告", "法律意见书", "分析意见", "备忘录", "策略分析", "类案检索"],
  },
  {
    category: "court_document",
    label: "法院文书",
    folder: "材料",
    confidence: "high",
    keywords: ["判决书", "裁定书", "调解书", "决定书", "传票", "开庭公告", "送达回证"],
    deadlineHint: "法院期限",
    deadlineType: "court",
  },
  {
    category: "evidence",
    label: "证据材料",
    folder: "材料",
    confidence: "low",
    keywords: ["证据", "证据清单", "附件", "截图", "录音", "录像", "照片"],
  },
  {
    category: "contract",
    label: "合同/协议",
    folder: "材料",
    confidence: "high",
    keywords: ["合同", "协议", "补充协议", "意向书", "框架协议"],
  },
  {
    category: "communication",
    label: "沟通记录",
    folder: "材料",
    confidence: "low",
    keywords: ["聊天记录", "邮件", "往来函", "沟通记录", "会议纪要"],
  },
];

const FILENAME_DATE_RE = /\d{4}-\d{2}-\d{2}/g;

/** Extract ISO-like dates (YYYY-MM-DD) from a file name. */
export function extractDates(fileName: string): string[] {
  return Array.from(new Set(fileName.match(FILENAME_DATE_RE) ?? [])).sort();
}

/** Classify a single file by its name. */
export function classifyMaterial(filePath: string): MaterialClassification {
  const fileName = basename(filePath);
  const lower = fileName.toLowerCase();
  const extractedDates = extractDates(fileName);

  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return {
        fileName,
        category: rule.category,
        label: rule.label,
        suggestedFolder: rule.folder,
        confidence: rule.confidence,
        extractedDates,
        notes: `按文件名命中「${rule.keywords.find((kw) => lower.includes(kw.toLowerCase()))}」归类`,
      };
    }
  }

  return {
    fileName,
    category: "other",
    label: "其他材料",
    suggestedFolder: "材料",
    confidence: "low",
    extractedDates,
    notes: "未命中明确分类规则，建议保留在材料目录待进一步识别",
  };
}

/** Classify multiple files. */
export function classifyMaterials(filePaths: string[]): MaterialClassification[] {
  return filePaths.map(classifyMaterial);
}

/** Infer deadlines from classifications and extracted dates.
 * Conservative: only creates a deadline when a high-confidence court/filing keyword
 * is paired with an extracted date.
 */
export function inferDeadlines(classifications: MaterialClassification[]): InferredDeadline[] {
  const deadlines: InferredDeadline[] = [];
  for (const item of classifications) {
    const rule = RULES.find((r) => r.category === item.category);
    if (!rule?.deadlineType || item.extractedDates.length === 0) continue;
    // Use the latest extracted date as the most likely deadline.
    const date = item.extractedDates[item.extractedDates.length - 1];
    const title = rule.deadlineHint ?? `处理 ${item.label}`;
    deadlines.push({ title, date, type: rule.deadlineType });
  }
  return deadlines;
}

/** Build a human-readable summary for the Agent or UI. */
export function summarizeClassifications(classifications: MaterialClassification[]): string {
  if (classifications.length === 0) return "未识别到任何材料。";
  const lines = classifications.map(
    (c) => `- ${c.fileName} → ${c.label}（建议放 ${c.suggestedFolder}/）${c.extractedDates.length ? `[日期: ${c.extractedDates.join(", ")}]` : ""}`,
  );
  return lines.join("\n");
}
