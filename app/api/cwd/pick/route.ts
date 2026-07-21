import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

export async function POST() {
  if (process.platform !== "darwin") {
    return NextResponse.json(
      { error: "当前系统暂不支持原生文件夹选择，请直接输入工作区路径。" },
      { status: 400 },
    );
  }

  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "选择 LegalNice 工作区")',
    ], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    const cwd = stdout.trim();
    return cwd ? NextResponse.json({ cwd }) : NextResponse.json({ cancelled: true });
  } catch (error) {
    // AppleScript exits with code 1 when the user presses Cancel.
    const exitCode = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: number }).code
      : undefined;
    if (exitCode === 1) return NextResponse.json({ cancelled: true });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法打开文件夹选择器。" },
      { status: 500 },
    );
  }
}
