import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";
import { defineTool, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mjuProjectAgentsDir } from "./mju-paths";

type AgentScope = "user" | "project";

type ConfigureSubagentInput = {
  action?: "create" | "update";
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  thinkingLevel?: string;
  tools?: string[];
  skills?: string[];
  mcp?: string[];
  fallbackModels?: string[];
  systemPromptMode?: "replace" | "append";
  inheritProjectContext?: boolean;
  inheritSkills?: boolean;
  async?: boolean;
  timeoutMs?: number;
  scope?: AgentScope;
};
type ConfigureSubagentDetails = { ok: boolean; action?: "create" | "update"; scope?: AgentScope; filePath?: string };

const PARAMS = Type.Object({
  action: Type.Optional(Type.Union([Type.Literal("create"), Type.Literal("update")])) ,
  name: Type.String({ description: "稳定的英文标识，例如 litigation-strategist" }),
  description: Type.String({ description: "一句话职责" }),
  systemPrompt: Type.String({ description: "完整的 System Prompt" }),
  model: Type.Optional(Type.String({ description: "可选模型标识，例如 provider/model" })),
  thinkingLevel: Type.Optional(Type.Union([Type.Literal("off"), Type.Literal("minimal"), Type.Literal("low"), Type.Literal("medium"), Type.Literal("high"), Type.Literal("xhigh"), Type.Literal("max")])),
  tools: Type.Optional(Type.Array(Type.String(), { description: "允许使用的工具名称列表" })),
  skills: Type.Optional(Type.Array(Type.String(), { description: "允许使用的技能名称列表" })),
  mcp: Type.Optional(Type.Array(Type.String(), { description: "允许使用的 MCP Server 名称列表" })),
  fallbackModels: Type.Optional(Type.Array(Type.String(), { description: "模型失败时按顺序尝试的备用模型" })),
  systemPromptMode: Type.Optional(Type.Union([Type.Literal("replace"), Type.Literal("append")])),
  inheritProjectContext: Type.Optional(Type.Boolean({ description: "是否继承项目 AGENTS.md/CLAUDE.md 等上下文" })),
  inheritSkills: Type.Optional(Type.Boolean({ description: "是否继承项目发现的技能目录" })),
  async: Type.Optional(Type.Boolean({ description: "是否默认后台运行" })),
  timeoutMs: Type.Optional(Type.Number({ description: "单次运行超时时间，单位毫秒" })),
  scope: Type.Optional(Type.Union([Type.Literal("user"), Type.Literal("project")])) ,
});

function projectAgentsDir(cwd: string): string {
  // Mju keeps project-level agent definitions outside the workspace so the
  // Obsidian vault stays a pure document archive.
  return mjuProjectAgentsDir(cwd);
}

function yamlValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", " ");
}

function serialize(input: ConfigureSubagentInput): string {
  const lines = [
    "---",
    `name: "${yamlValue(input.name)}"`,
    `description: "${yamlValue(input.description.trim())}"`,
  ];
  if (input.model?.trim()) lines.push(`model: "${yamlValue(input.model.trim())}"`);
  if (input.thinkingLevel && input.thinkingLevel !== "off") lines.push(`thinking: "${yamlValue(input.thinkingLevel)}"`);
  const tools = [...(input.tools ?? []), ...(input.mcp ?? []).map((server) => server.startsWith("mcp:") ? server : `mcp:${server}`)];
  if (tools.length) lines.push(`tools: "${tools.join(",")}"`);
  if (input.skills?.length) lines.push(`skills: "${input.skills.join(",")}"`);
  if (input.fallbackModels?.length) lines.push(`fallbackModels: "${input.fallbackModels.join(",")}"`);
  if (input.systemPromptMode === "append") lines.push("systemPromptMode: \"append\"");
  if (input.inheritProjectContext) lines.push("inheritProjectContext: \"true\"");
  if (input.inheritSkills) lines.push("inheritSkills: \"true\"");
  if (input.async) lines.push("async: \"true\"");
  if (input.timeoutMs) lines.push(`timeoutMs: "${Math.max(1000, Math.round(input.timeoutMs))}"`);
  lines.push("---", "", input.systemPrompt.trim(), "");
  return lines.join("\n");
}

function existingNames(dir: string): Set<string> {
  try {
    return new Set(readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => parse(entry.name).name));
  } catch {
    return new Set();
  }
}

export function createSubagentConfigTool(cwd: string, reload?: () => Promise<void>) {
  return defineTool({
    name: "configure_subagent",
    label: "Configure Subagent",
    description: "Create or update a Pi Subagent configuration from a natural-language role specification. Use this when the user asks to create, configure, update, or save a Subagent/Agent role. Persist the complete description and System Prompt, then report the exact file path and scope.",
    promptSnippet: "Create or update a Subagent configuration from a role specification",
    promptGuidelines: [
      "Use configure_subagent when the user provides a Subagent role, responsibilities, System Prompt, model, tools, or scope and asks Pi to configure it.",
      "Preserve the user's System Prompt faithfully; do not summarize away permissions, prohibitions, output formats, or directory restrictions.",
      "Use scope user for reusable legal-team roles; use scope project for a case or repository-specific Agent. If the scope is genuinely ambiguous, ask the user before saving.",
    ],
    parameters: PARAMS,
    execute: async (_toolCallId, rawParams) => {
      const input = rawParams as ConfigureSubagentInput;
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(input.name)) {
        return { content: [{ type: "text", text: "配置失败：name 只能包含英文字母、数字、点、下划线和短横线。" }], details: { ok: false } as ConfigureSubagentDetails };
      }
      if (!input.description.trim() || !input.systemPrompt.trim()) {
        return { content: [{ type: "text", text: "配置失败：description 和 systemPrompt 不能为空。" }], details: { ok: false } as ConfigureSubagentDetails };
      }
      const scope = input.scope ?? "user";
      const dir = scope === "user" ? join(getAgentDir(), "agents") : projectAgentsDir(cwd);
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, `${parse(input.name).base}.md`);
      const existed = existsSync(filePath) || existingNames(dir).has(input.name);
      writeFileSync(filePath, serialize({ ...input, scope }), "utf8");
      await reload?.();
      return {
        content: [{ type: "text", text: `已${existed ? "更新" : "创建"} Subagent「${input.name}」。\n作用域：${scope === "project" ? "项目" : "全局"}\n配置文件：${filePath}` }],
        details: { ok: true, action: existed ? "update" : "create", scope, filePath } as ConfigureSubagentDetails,
      };
    },
  });
}
