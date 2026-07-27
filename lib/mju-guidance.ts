import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Canonical project structure + agent guidance for new Mju users.
 *
 * The layout mirrors the conventions Mju parses (see lib/mju-vault-items.ts):
 * cases as folders, one markdown file per 任务/期限/日程 with structured
 * frontmatter. Works with or without Obsidian — when the structure exists,
 * Mju scans it the same way (see lib/mju-obsidian.ts).
 */

export const CANONICAL_DIRS = [
  "ops/cases/案卷",
  "ops/cases/休眠案卷",
  "ops/cases/归档案卷",
  "ops/projects/活跃项目",
  "ops/projects/休眠项目",
  "ops/projects/归档项目",
  "ops/common/任务",
  "ops/common/日程",
  "templates/legal",
];

export const CASE_SKELETON_DIRS = ["任务", "期限", "日程", "材料", "分析", "文书", "工作包", "大事记"];

/**
 * Create the standard subdirectories inside a case folder and a lightweight
 * master file. Safe to call repeatedly — existing directories/files are left
 * untouched. Works for both litigation cases and the inbox case.
 */
export function ensureCaseSkeleton(
  caseDir: string,
  caseTitle: string,
  caseType?: "advisory" | "litigation" | "project",
): { dirs: string[]; masterFileWritten: boolean } {
  const dirs: string[] = [];
  for (const dir of CASE_SKELETON_DIRS) {
    const full = join(caseDir, dir);
    if (!existsSync(full)) {
      mkdirSync(full, { recursive: true });
      dirs.push(dir);
    }
  }

  const safeTitle = caseTitle.replace(/[\\/]+/g, "_");
  const masterPath = join(caseDir, `${safeTitle}.md`);
  let masterFileWritten = false;
  if (!existsSync(masterPath)) {
    const now = new Date().toISOString();
    const typeLabel = caseType === "litigation"
      ? "争议解决"
      : caseType === "project"
      ? "专项"
      : "法律顾问";
    writeFileSync(
      masterPath,
      `---
案件名: "${caseTitle}"
案件类型: ${typeLabel}
状态: 进行中
创建时间: ${now}
---

# ${caseTitle}

## 当事人与背景
（待补充）

## 程序阶段
（待补充）

## 待办事项
见 \`任务/\` 目录。

## 材料清单
见 \`材料/\` 目录。

## 关键期限
见 \`期限/\` 目录。
`,
      "utf8",
    );
    masterFileWritten = true;
  }

  return { dirs, masterFileWritten };
}

export function hasCanonicalStructure(cwd: string): boolean {
  return existsSync(join(cwd, "ops", "cases", "案卷"));
}

/** Create the canonical directories; returns the ones that were created. */
export function ensureCanonicalStructure(cwd: string): string[] {
  const created: string[] = [];
  for (const dir of CANONICAL_DIRS) {
    const full = join(cwd, dir);
    if (!existsSync(full)) {
      mkdirSync(full, { recursive: true });
      created.push(dir);
    }
  }
  return created;
}

export const GUIDANCE_FILENAME = "AGENTS.md";

export const GUIDANCE_TEMPLATE = [
  "# Agent 工作指导（Mju 标准结构）",
  "",
  "> 本文件由 Mju 生成，指导 Agent 在本目录下的工作方式。所有回复使用中文。",
  "",
  "## 目录结构",
  "",
  "- `ops/cases/案卷/` — 诉讼案件，一案一个文件夹",
  "- `ops/cases/休眠案卷/`、`ops/cases/归档案卷/` — 休眠与归档",
  "- `ops/projects/活跃项目/` — 常年顾问与专项项目",
  "- `ops/projects/休眠项目/`、`ops/projects/归档项目/` — 项目休眠与归档",
  "- `ops/common/任务/`、`ops/common/日程/` — 不属于具体案件的通用事项",
  "- `templates/legal/` — 文书模板（.md / .docx 母版）",
  "",
  "## 案件文件夹内部",
  "",
  "每个案件文件夹使用统一的子目录：",
  "",
  "```",
  "任务/ 期限/ 日程/ 材料/ 分析/ 文书/ 工作包/ 大事记/",
  "```",
  "",
  "- `任务/` 只放任务页，不放具体文书产物；产物放进 `工作包/<日期_名称>/`",
  "- `文书/` 可细分 `定稿/`、`已发客户/`、`已提交法院/`",
  "",
  "## 任务 / 期限 / 日程（硬性规则）",
  "",
  "**一个事项一个 Markdown 文件**，放在对应子目录，frontmatter 使用以下字段（这是 Mju 读取日程与期限的依据，必须严格遵守）：",
  "",
  "```yaml",
  "---",
  "事项类型: 任务 | 期限 | 日程",
  "状态: 待办 | 进行中 | 完成 | 取消",
  "截止日期: YYYY-MM-DD        # 任务、期限必填；不确定写 待确认",
  "开始时间: YYYY-MM-DD HH:mm  # 日程必填",
  "结束时间: YYYY-MM-DD HH:mm  # 日程可选",
  "描述: …",
  "---",
  "```",
  "",
  "- `状态` 只能使用：待办 / 进行中 / 完成 / 取消（不要写\"已完成\"\"已取消\"等变体）",
  "- 开庭属于 `日程/`，不要放进 `期限/`",
  "- 文件命名：`YYYY-MM-DD_标题.md` 或 `标题-YYYY-MM-DD.md`",
  "- 完成任务后把 `状态` 改为 `完成`，不要删除文件",
  "",
  "## 资料归位（自动执行，不询问用户）",
  "",
  "当用户粘贴、上传、引用或发来任何与当前案件相关的资料（PDF、Word、图片、聊天记录、邮件、网页链接、文字片段等）时，按以下规则自动处理，不需要问用户\"该放哪\"。",
  "",
  "1. **原始材料 / 外部来源**：原样保存到当前案件的 `材料/` 目录。保留原始文件名；若重名，追加 `-2`、`-3` 等序号，不要覆盖。",
  "2. **对外交付的法律文件**：保存到 `文书/`。",
  "3. **内部研究、分析、检索报告**：保存到 `分析/`。",
  "4. **一次事项涉及多份文件**：在 `工作包/<事项名称>/` 下集中存放，并在 `任务/` 建同名任务页；任务页 frontmatter 用 `事项类型: 任务`。",
  "5. **收到资料后必须登记**：",
  "   - 如果资料需要后续处理 → 在 `任务/` 创建任务页（含截止日期，如果已知或能推断）",
  "   - 如果只是已发生的事件/节点 → 在 `大事记/` 创建记录",
  "6. **禁止行为**：不要直接把资料堆在案件根目录；不要把原始 PDF/DOCX 原件放进 `文书/` 或 `分析/`（它们属于 `材料/`）；不要修改原始材料文件内容。",
  "",
  "## 命名与风格",
  "",
  "- 目录和文件用中文；案件名中的\"对\"用英文小写 `vs`",
  "- 修改用户文件前先读全文；不擅自删除任何文件",
].join("\n");

/** Write the guidance file if none exists; returns true when written. */
export function writeGuidanceIfAbsent(cwd: string): boolean {
  const path = join(cwd, GUIDANCE_FILENAME);
  if (existsSync(path)) return false;
  writeFileSync(path, GUIDANCE_TEMPLATE, "utf8");
  return true;
}

/**
 * Copy the bundled default skills (defaults/skills/ in the repo) into the
 * project's `.agents/skills/` so pi's resource loader discovers them as
 * project skills. Existing skill folders are left untouched.
 * Returns the skill names that were installed.
 */
export function installDefaultSkills(cwd: string): string[] {
  const source = join(process.cwd(), "defaults", "skills");
  if (!existsSync(source)) return [];
  const targetRoot = join(cwd, ".agents", "skills");
  const installed: string[] = [];
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = join(targetRoot, entry.name);
    if (existsSync(target)) continue;
    mkdirSync(targetRoot, { recursive: true });
    cpSync(join(source, entry.name), target, { recursive: true });
    installed.push(entry.name);
  }
  return installed;
}
