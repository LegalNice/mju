import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkMjuUpdate } from "@/lib/mju-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    return packageJson.version ?? "";
  } catch {
    return "";
  }
}

export async function GET() {
  const filePath = join(process.cwd(), "CHANGELOG.md");
  const content = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const update = await checkMjuUpdate();
  return NextResponse.json({ version: getVersion(), content, update });
}
