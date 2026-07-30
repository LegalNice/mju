import { NextResponse } from "next/server";
import { calculate, type CalcTool } from "@/lib/legal-calculators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TOOLS = new Set<CalcTool>([
  "filingFee",
  "preservationFee",
  "executionFee",
  "lawyerFee",
  "simpleInterest",
  "latePaymentInterest",
  "amountToChinese",
]);

interface CalcBody {
  tool?: unknown;
  params?: Record<string, unknown>;
}

/**
 * 确定性计算引擎入口。Agent 写文书时涉及金额/费额推算必须调用本接口，
 * 不得自行口算。工具页前端共用同一套纯函数。
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CalcBody;
    if (typeof body.tool !== "string" || !VALID_TOOLS.has(body.tool as CalcTool)) {
      return NextResponse.json(
        { error: "tool 必须是已知计算工具之一" },
        { status: 400 },
      );
    }
    const params = body.params && typeof body.params === "object" ? body.params : {};
    const result = calculate(body.tool as CalcTool, params);
    return NextResponse.json({ tool: body.tool, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
