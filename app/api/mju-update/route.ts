import { NextResponse } from "next/server";
import { checkMjuUpdate } from "@/lib/mju-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESTART_AFTER_UPDATE = 75;

/**
 * The route never runs a shell command. It only asks the `mju` launcher to
 * perform its fixed global npm update command, then restart this server.
 */
export async function POST(req: Request) {
  let body: { action?: unknown };
  try {
    body = await req.json() as { action?: unknown };
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  if (body.action !== "update") return NextResponse.json({ error: "不支持的更新操作" }, { status: 400 });

  const update = await checkMjuUpdate();
  if (update.state !== "update-available") {
    return NextResponse.json({ error: "当前没有可安装的新版本", update }, { status: 409 });
  }
  if (!update.canUpdate) {
    const message = update.installMode === "npx"
      ? "当前通过 npx 临时运行；关闭后重新执行 npx @tttangerine/mju@latest 即可使用最新版。"
      : "当前不是全局安装；请按你的安装方式更新后重新启动 Mju。";
    return NextResponse.json({ error: message, update }, { status: 409 });
  }

  setTimeout(() => process.exit(RESTART_AFTER_UPDATE), 500).unref();
  return NextResponse.json({ status: "restarting", update });
}
