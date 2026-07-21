import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getPiCliPath, getPiSubagentsPaths } from "@/lib/pi-runtime-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskStatus = "backlog" | "active" | "done";
type BoardTask = { id: string; title: string; detail: string; agent: string; status: TaskStatus; createdAt: string; output?: string; error?: string };

function boardPath(cwd: string): string {
  let current = cwd;
  while (true) {
    const candidate = join(current, ".pi");
    if (existsSync(candidate)) return join(candidate, "board.json");
    const parent = dirname(current);
    if (parent === current) return join(cwd, ".pi", "board.json");
    current = parent;
  }
}

function readTasks(path: string): BoardTask[] {
  try { const parsed = JSON.parse(readFileSync(path, "utf8")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function writeTasks(path: string, tasks: BoardTask[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(tasks, null, 2) + "\n", "utf8");
}

async function runAgent(task: BoardTask, cwd: string): Promise<string> {
  const piCliPath = getPiCliPath();
  const subagentPaths = getPiSubagentsPaths();
  if (!piCliPath || !subagentPaths) throw new Error("Mju Agents 内置 Pi 运行时未正确安装。");
  const args = ["--mode", "json", "-p", "--no-session", "--extension", subagentPaths.extension];
  // Delegate through pi-subagents' native /run command. The child Pi process
  // discovers the selected user/project Agent file itself, so model,
  // thinking, tools, skills, MCP, and context policy stay in one runtime.
  args.push(`/run ${task.agent} ${task.title}\n\n${task.detail}`);
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [piCliPath, ...args], { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let buffer = ""; let stderr = ""; let output = "";
    const consume = (line: string) => { try { const event = JSON.parse(line); const message = event.type === "message_end" ? event.message : null; if (message?.role === "assistant" && Array.isArray(message.content)) output = message.content.filter((part: { type?: string; text?: string }) => part.type === "text").map((part: { text?: string }) => part.text || "").join("\n").trim(); } catch { /* non-json process output */ } };
    child.stdout.on("data", (chunk) => { buffer += chunk.toString(); const lines = buffer.split("\n"); buffer = lines.pop() || ""; lines.forEach(consume); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => { if (code === 0) resolve(output || "Subagent 已完成，但没有返回文字结果。"); else reject(new Error(stderr.trim() || `Subagent exited with code ${code}`)); });
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url); const cwd = searchParams.get("cwd");
  if (!cwd) return Response.json({ error: "cwd is required" }, { status: 400 });
  return Response.json({ tasks: readTasks(boardPath(cwd)) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<BoardTask> & { cwd?: string; action?: string };
    if (!body.cwd) return Response.json({ error: "cwd is required" }, { status: 400 });
    if (!existsSync(body.cwd)) return Response.json({ error: "cwd does not exist" }, { status: 400 });
    const path = boardPath(body.cwd); const tasks = readTasks(path);
    if (body.action === "delete") { writeTasks(path, tasks.filter((task) => task.id !== body.id)); return Response.json({ success: true }); }
    if (body.action === "run_inline") {
      if (!body.agent?.trim() || !body.title?.trim()) return Response.json({ error: "agent and title are required" }, { status: 400 });
      const inlineTask: BoardTask = { id: randomUUID(), title: body.title.trim(), detail: body.detail?.trim() || "", agent: body.agent.trim(), status: "active", createdAt: new Date().toISOString() };
      const output = await runAgent(inlineTask, body.cwd);
      return Response.json({ success: true, output });
    }
    if (body.action === "run") {
      const index = tasks.findIndex((task) => task.id === body.id); if (index < 0) return Response.json({ error: "task not found" }, { status: 404 });
      tasks[index] = { ...tasks[index], status: "active", error: undefined }; writeTasks(path, tasks);
      try { const output = await runAgent(tasks[index], body.cwd); tasks[index] = { ...tasks[index], status: "done", output }; writeTasks(path, tasks); return Response.json({ success: true, task: tasks[index] }); }
      catch (error) { tasks[index] = { ...tasks[index], status: "backlog", error: error instanceof Error ? error.message : String(error) }; writeTasks(path, tasks); return Response.json({ error: tasks[index].error }, { status: 500 }); }
    }
    if (!body.title?.trim() || !body.agent?.trim()) return Response.json({ error: "title and agent are required" }, { status: 400 });
    const task: BoardTask = { id: randomUUID(), title: body.title.trim(), detail: body.detail?.trim() || "", agent: body.agent.trim(), status: body.status ?? "backlog", createdAt: new Date().toISOString() };
    tasks.unshift(task); writeTasks(path, tasks); return Response.json({ success: true, task });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  try { const body = await req.json() as Partial<BoardTask> & { cwd?: string }; if (!body.cwd || !body.id) return Response.json({ error: "cwd and id are required" }, { status: 400 }); const path = boardPath(body.cwd); const tasks = readTasks(path); const index = tasks.findIndex((task) => task.id === body.id); if (index < 0) return Response.json({ error: "task not found" }, { status: 404 }); tasks[index] = { ...tasks[index], ...body, id: tasks[index].id, createdAt: tasks[index].createdAt }; writeTasks(path, tasks); return Response.json({ success: true, task: tasks[index] }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
