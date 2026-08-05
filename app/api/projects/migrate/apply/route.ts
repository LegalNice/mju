import { NextResponse } from "next/server";
import { getProjectStore, isProjectStore } from "@/lib/mju-route-utils";
import { applyCaseMigration, type MigrationDecision } from "@/lib/case-migration";
import { join } from "node:path";

export const runtime = "nodejs";

function isValidDecision(value: unknown): value is MigrationDecision {
  if (!value || typeof value !== "object") return false;
  const decision = value as Partial<MigrationDecision>;
  if (typeof decision.sourcePath !== "string" || decision.sourcePath.length === 0) return false;
  if (decision.accept === false) return true;
  if (decision.accept !== true) return false;
  if (typeof decision.title !== "string" || decision.title.trim().length === 0) return false;
  if (decision.type !== "advisory" && decision.type !== "litigation" && decision.type !== "project") return false;
  if (decision.status !== "active" && decision.status !== "dormant" && decision.status !== "closed") return false;
  if (decision.stageIndex !== undefined
    && (typeof decision.stageIndex !== "number" || !Number.isFinite(decision.stageIndex))) return false;
  if (decision.looseFiles !== undefined
    && (!Array.isArray(decision.looseFiles) || decision.looseFiles.some((f) => typeof f !== "string"))) return false;
  return true;
}

/**
 * POST { cwd, decisions[] } → MigrationApplyResult
 *
 * 执行用户确认后的既有案卷整理：移动文件夹进标准结构、归类散文件、
 * 登记案件并推断期限/日程、写大事记与核对任务。
 * 安全约束：decisions 里的 sourcePath/looseFiles 必须位于项目根目录内，
 * 防止越界移动任意文件。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: unknown; decisions?: unknown };
    const project = getProjectStore(typeof body.cwd === "string" ? body.cwd : null);
    if (!isProjectStore(project)) return project.response;
    if (!Array.isArray(body.decisions) || body.decisions.some((d) => !isValidDecision(d))) {
      return NextResponse.json({ error: "invalid decisions" }, { status: 400 });
    }

    const cwdPrefix = join(project.cwd, "/");
    const insideProject = (path: string) => path.startsWith(cwdPrefix);
    for (const decision of body.decisions) {
      if (!insideProject(decision.sourcePath)) {
        return NextResponse.json({ error: `sourcePath outside project: ${decision.sourcePath}` }, { status: 400 });
      }
      for (const loose of decision.looseFiles ?? []) {
        if (!insideProject(loose)) {
          return NextResponse.json({ error: `loose file outside project: ${loose}` }, { status: 400 });
        }
      }
    }

    const result = applyCaseMigration(project.cwd, project.store, body.decisions);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
