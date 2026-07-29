import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname, parse } from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { loadSkillsWithInstallInfo } from "@/lib/skills-service";
import { mjuProjectAgentsDir } from "@/lib/mju-paths";

export const dynamic = "force-dynamic";

type AgentScope = "user" | "project" | "bundled";
type WritableAgentScope = Exclude<AgentScope, "bundled">;

type AgentRecord = {
  name: string;
  description: string;
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
  systemPrompt: string;
  scope: AgentScope;
  filePath: string;
  overridden?: boolean;
  overrideScope?: WritableAgentScope;
};

/** Legacy in-workspace locations, kept readable for backward compatibility. */
function legacyAgentsDirs(cwd: string): string[] {
  const dirs: string[] = [];
  const mjuDir = join(cwd, ".mju", "agents");
  if (existsSync(mjuDir)) dirs.push(mjuDir);
  let current = cwd;
  while (true) {
    const candidate = join(current, ".pi", "agents");
    if (existsSync(candidate)) {
      dirs.push(candidate);
      break;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

/** Primary dir first, then legacy dirs; earlier entries win on name conflicts. */
function projectAgentsDirs(cwd: string): string[] {
  return [mjuProjectAgentsDir(cwd), ...legacyAgentsDirs(cwd)];
}

function getDir(scope: WritableAgentScope, cwd?: string): string | null {
  if (scope === "user") return join(getAgentDir(), "agents");
  return cwd ? mjuProjectAgentsDir(cwd) : null;
}

function validName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

function readAgents(dir: string, scope: AgentScope): AgentRecord[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .flatMap((entry) => {
      const filePath = join(dir, entry.name);
      try {
        const content = readFileSync(filePath, "utf8");
        const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
        if (!frontmatter.name || !frontmatter.description) return [];
        return [{
          name: frontmatter.name,
          description: frontmatter.description,
          model: frontmatter.model || undefined,
          thinkingLevel: frontmatter.thinking as AgentRecord["thinkingLevel"],
          tools: frontmatter.tools?.split(",").map((tool) => tool.trim()).filter((tool) => tool && !tool.startsWith("mcp:")),
          skills: frontmatter.skills?.split(",").map((skill) => skill.trim()).filter(Boolean),
          mcp: [
            ...(frontmatter.tools?.split(",").map((tool) => tool.trim().replace(/^mcp:/, "")).filter((tool) => tool && frontmatter.tools?.includes(`mcp:${tool}`)) ?? []),
            ...(frontmatter.mcp?.split(",").map((server) => server.trim().replace(/^mcp:/, "")).filter(Boolean) ?? []),
          ],
          fallbackModels: frontmatter.fallbackModels?.split(",").map((model) => model.trim()).filter(Boolean),
          systemPromptMode: frontmatter.systemPromptMode === "append" ? "append" : "replace",
          inheritProjectContext: frontmatter.inheritProjectContext === "true",
          inheritSkills: frontmatter.inheritSkills === "true",
          async: frontmatter.async === "true",
          timeoutMs: frontmatter.timeoutMs ? Number(frontmatter.timeoutMs) : undefined,
          systemPrompt: body.trim(),
          scope,
          filePath,
        }];
      } catch {
        return [];
      }
    });
}

function yamlValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", " ");
}

function serializeAgent(agent: { name: string; description: string; model?: string; thinkingLevel?: string; tools?: string[]; skills?: string[]; mcp?: string[]; fallbackModels?: string[]; systemPromptMode?: string; inheritProjectContext?: boolean; inheritSkills?: boolean; async?: boolean; timeoutMs?: number; systemPrompt: string }): string {
  const lines = [
    "---",
    `name: "${yamlValue(agent.name)}"`,
    `description: "${yamlValue(agent.description)}"`,
  ];
  if (agent.model) lines.push(`model: "${yamlValue(agent.model)}"`);
  if (agent.thinkingLevel && agent.thinkingLevel !== "off") lines.push(`thinking: "${yamlValue(agent.thinkingLevel)}"`);
  const tools = [...(agent.tools ?? []), ...(agent.mcp ?? []).map((server) => server.startsWith("mcp:") ? server : `mcp:${server}`)];
  if (tools.length) lines.push(`tools: "${tools.join(",")}"`);
  if (agent.skills?.length) lines.push(`skills: "${agent.skills.join(",")}"`);
  if (agent.fallbackModels?.length) lines.push(`fallbackModels: "${agent.fallbackModels.join(",")}"`);
  if (agent.systemPromptMode === "append") lines.push("systemPromptMode: \"append\"");
  if (agent.inheritProjectContext) lines.push("inheritProjectContext: \"true\"");
  if (agent.inheritSkills) lines.push("inheritSkills: \"true\"");
  if (agent.async) lines.push("async: \"true\"");
  if (agent.timeoutMs) lines.push(`timeoutMs: "${Math.max(1000, Math.round(agent.timeoutMs))}"`);
  lines.push("---", "", agent.systemPrompt.trim(), "");
  return lines.join("\n");
}

export async function OPTIONS(req: Request) {
  const cwd = new URL(req.url).searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
  try {
    const skillsResponse = await loadSkillsWithInstallInfo(cwd);
    let mcp: string[] = [];
    try {
      const cache = JSON.parse(readFileSync(join(getAgentDir(), "mcp-cache.json"), "utf8")) as { servers?: Record<string, unknown> };
      mcp = Object.keys(cache.servers ?? {}).sort();
    } catch { /* MCP cache is optional. */ }
    return NextResponse.json({
      skills: skillsResponse.skills.map((skill) => ({ name: skill.name, description: skill.description, filePath: skill.filePath })),
      mcp,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd") || undefined;
  if (searchParams.get("options") === "1") return OPTIONS(req);
  const userDir = getDir("user")!;
  const projectDirs = cwd ? projectAgentsDirs(cwd) : [];
  const projectAgents = new Map<string, AgentRecord>();
  for (const dir of projectDirs) {
    for (const agent of readAgents(dir, "project")) {
      if (!projectAgents.has(agent.name)) projectAgents.set(agent.name, agent);
    }
  }
  const userAgents = readAgents(userDir, "user");
  const userNames = new Set(userAgents.map((agent) => agent.name));
  const projectNames = new Set(projectAgents.keys());
  const bundledAgents = readAgents(join(process.cwd(), "defaults", "agents"), "bundled")
    .map((agent) => {
      const overrideScope = userNames.has(agent.name) ? "user" : projectNames.has(agent.name) ? "project" : undefined;
      return { ...agent, overridden: Boolean(overrideScope), overrideScope };
    });
  return NextResponse.json({
    agents: [...userAgents, ...projectAgents.values(), ...bundledAgents],
    directories: { user: userDir, project: projectDirs[0] ?? null, legacy: projectDirs.slice(1) },
  });
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as Partial<AgentRecord> & { cwd?: string; scope?: AgentScope };
    const { name, description, model, thinkingLevel, tools, skills, mcp, fallbackModels, systemPromptMode, inheritProjectContext, inheritSkills, async: asyncRun, timeoutMs, systemPrompt, cwd, scope = "user" } = body;
    if (!name || !validName(name)) return NextResponse.json({ error: "invalid name" }, { status: 400 });
    if (!description?.trim()) return NextResponse.json({ error: "description required" }, { status: 400 });
    if (scope !== "user" && scope !== "project") return NextResponse.json({ error: "invalid scope" }, { status: 400 });
    const dir = getDir(scope, cwd);
    if (!dir) return NextResponse.json({ error: "cwd required for project agents" }, { status: 400 });
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${parse(name).base}.md`);
    writeFileSync(filePath, serializeAgent({ name, description, model, thinkingLevel, tools, skills, mcp, fallbackModels, systemPromptMode, inheritProjectContext, inheritSkills, async: asyncRun, timeoutMs, systemPrompt: systemPrompt || "" }), "utf8");
    return NextResponse.json({ success: true, filePath });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { name?: string; cwd?: string; scope?: AgentScope };
    if (!body.name || !validName(body.name)) return NextResponse.json({ error: "invalid name" }, { status: 400 });
    const scope = body.scope || "user";
    if (scope === "bundled") return NextResponse.json({ error: "bundled agents cannot be deleted" }, { status: 400 });
    // Delete from the primary dir and any legacy dirs so old copies cannot
    // resurrect the agent through the backward-compatible read path.
    const dirs = scope === "user"
      ? [getDir("user")!]
      : body.cwd
        ? projectAgentsDirs(body.cwd)
        : [];
    if (dirs.length === 0) return NextResponse.json({ error: "cwd required for project agents" }, { status: 400 });
    const fileName = `${parse(body.name).base}.md`;
    for (const dir of dirs) {
      const filePath = join(dir, fileName);
      if (existsSync(filePath)) unlinkSync(filePath);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
