"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { DEFAULT_LITIGATION_STAGES, type CaseStatus, type CaseType } from "@/lib/mju-models";

type Candidate = {
  sourcePath: string;
  title: string;
  type: CaseType;
  status: CaseStatus;
  stage: string;
  stageIndex?: number;
  parties?: { plaintiff?: string; defendant?: string; other?: string[] };
  court?: string;
  caseNumber?: string;
  fileCount: number;
  sampleFiles: string[];
  signals: string[];
};

type LooseFile = { path: string; name: string };

type ScanResponse = {
  candidates: Candidate[];
  looseFiles: LooseFile[];
  refined: boolean;
  model?: string;
  error?: string;
};

type Row = {
  accept: boolean;
  sourcePath: string;
  title: string;
  type: CaseType;
  status: CaseStatus;
  stageIndex: number;
  plaintiff: string;
  defendant: string;
  court: string;
  caseNumber: string;
  fileCount: number;
  signals: string[];
};

type ApplyItem = {
  sourcePath: string;
  ok: boolean;
  title?: string;
  targetPath?: string;
  deadlines?: number;
  schedules?: number;
  error?: string;
};

type ApplyResponse = {
  success: boolean;
  result: {
    items: ApplyItem[];
    casesCreated: number;
    deadlinesCreated: number;
    schedulesCreated: number;
    reviewTasksCreated: number;
  };
  error?: string;
};

const STATUS_LABEL: Record<CaseStatus, string> = { active: "活跃", dormant: "休眠", closed: "归档" };
const TYPE_LABEL: Record<CaseType, string> = { litigation: "诉讼", advisory: "顾问", project: "专项" };

const input: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 2,
  background: "transparent",
  color: "var(--text)",
  fontSize: 12,
  padding: "5px 8px",
  font: "inherit",
};

function toRow(candidate: Candidate): Row {
  return {
    accept: true,
    sourcePath: candidate.sourcePath,
    title: candidate.title,
    type: candidate.type,
    status: candidate.status,
    stageIndex: candidate.stageIndex ?? 0,
    plaintiff: candidate.parties?.plaintiff ?? "",
    defendant: candidate.parties?.defendant ?? "",
    court: candidate.court ?? "",
    caseNumber: candidate.caseNumber ?? "",
    fileCount: candidate.fileCount,
    signals: candidate.signals,
  };
}

function targetPreview(row: Row): string {
  const bucket = row.status === "closed" ? "归档" : row.status === "dormant" ? "休眠" : "";
  const base = row.type === "litigation" ? `ops/cases/${bucket}案卷` : `ops/projects/${bucket || "活跃"}项目`;
  return `${base}/${row.title.trim() || "未命名案件"}`;
}

/**
 * 既有案卷整理向导：扫描 → 逐项确认/编辑 → 执行 → 结果。
 * 初始化向导第二步与入口页「整理既有案卷」按钮共用。
 */
export function MigrateCasesModal({
  cwd,
  onClose,
}: {
  cwd: string;
  onClose: (applied?: { casesCreated: number }) => void;
}) {
  const [phase, setPhase] = useState<"scanning" | "review" | "applying" | "done">("scanning");
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [looseAssign, setLooseAssign] = useState<Record<string, string>>({}); // loose path → sourcePath | ""
  const [applyResult, setApplyResult] = useState<ApplyResponse["result"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects/migrate/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd }),
    })
      .then(async (res) => {
        const data = await res.json() as ScanResponse;
        if (!res.ok) throw new Error(data.error || "扫描失败");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setScan(data);
        setRows(data.candidates.map(toRow));
        setPhase("review");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("review");
      });
    return () => { cancelled = true; };
  }, [cwd]);

  const acceptedCount = useMemo(() => rows.filter((row) => row.accept).length, [rows]);

  const patchRow = (sourcePath: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((row) => row.sourcePath === sourcePath ? { ...row, ...patch } : row));
  };

  const apply = async () => {
    if (phase === "applying" || acceptedCount === 0) return;
    setPhase("applying");
    setError(null);
    const decisions = rows
      .filter((row) => row.accept)
      .map((row) => ({
        sourcePath: row.sourcePath,
        accept: true as const,
        title: row.title,
        type: row.type,
        status: row.status,
        stageIndex: row.type === "litigation" ? row.stageIndex : undefined,
        parties: (row.plaintiff || row.defendant)
          ? { plaintiff: row.plaintiff || undefined, defendant: row.defendant || undefined }
          : undefined,
        court: row.court || undefined,
        caseNumber: row.caseNumber || undefined,
        looseFiles: (scan?.looseFiles ?? [])
          .filter((file) => looseAssign[file.path] === row.sourcePath)
          .map((file) => file.path),
      }));
    try {
      const res = await fetch("/api/projects/migrate/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, decisions }),
      });
      const data = await res.json() as ApplyResponse;
      if (!res.ok) throw new Error(data.error || "整理失败");
      setApplyResult(data.result);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("review");
    }
  };

  const close = () => {
    onClose(applyResult && applyResult.casesCreated > 0 ? { casesCreated: applyResult.casesCreated } : undefined);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, background: "rgba(0,0,0,.32)" }}
      onClick={(event) => { if (event.target === event.currentTarget && phase !== "applying") close(); }}
    >
      <section
        style={{ width: 640, maxWidth: "100%", maxHeight: "82vh", overflow: "auto", padding: 24, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", boxShadow: "var(--overlay-shadow)" }}
        aria-label="整理既有案卷"
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ color: "var(--accent)", fontSize: 10, fontWeight: 700, letterSpacing: ".12em" }}>MJU — CASE MIGRATION</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>整理既有案卷</h2>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
              把散落的案件文件夹移入标准结构（ops/cases 或 ops/projects），登记为 Mju 案件。
            </p>
          </div>
          <button onClick={close} disabled={phase === "applying"} aria-label="关闭整理向导" style={{ border: 0, background: "transparent", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>×</button>
        </header>

        {phase === "scanning" && (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>正在扫描项目目录并推断案件信息…</p>
        )}

        {phase === "review" && error && rows.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--accent)" }}>{error}</p>
        )}

        {(phase === "review" || phase === "applying") && rows.length === 0 && !error && (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>没有发现可整理的既有案卷，目录已经是标准结构。</p>
        )}

        {(phase === "review" || phase === "applying") && rows.length > 0 && (
          <>
            {scan && (
              <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-dim)" }}>
                发现 {rows.length} 个疑似案件文件夹
                {scan.refined ? `（已用 ${scan.model} 精修，请逐项核对）` : "（规则推断，未做 AI 精修，请逐项核对）"}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((row) => (
                <div
                  key={row.sourcePath}
                  style={{
                    border: `1px solid ${row.accept ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 4,
                    padding: 12,
                    opacity: row.accept ? 1 : 0.55,
                  }}
                >
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={row.accept}
                      onChange={(e) => patchRow(row.sourcePath, { accept: e.target.checked })}
                    />
                    <input
                      value={row.title}
                      onChange={(e) => patchRow(row.sourcePath, { title: e.target.value })}
                      style={{ ...input, flex: 1, fontWeight: 700 }}
                      aria-label="案件名"
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <select
                      value={row.type}
                      onChange={(e) => patchRow(row.sourcePath, { type: e.target.value as CaseType })}
                      style={input}
                      aria-label="案件类型"
                    >
                      {(Object.keys(TYPE_LABEL) as CaseType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                    </select>
                    <select
                      value={row.status}
                      onChange={(e) => patchRow(row.sourcePath, { status: e.target.value as CaseStatus })}
                      style={input}
                      aria-label="案件状态"
                    >
                      {(Object.keys(STATUS_LABEL) as CaseStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    {row.type === "litigation" && (
                      <select
                        value={row.stageIndex}
                        onChange={(e) => patchRow(row.sourcePath, { stageIndex: Number(e.target.value) })}
                        style={input}
                        aria-label="程序阶段"
                      >
                        {DEFAULT_LITIGATION_STAGES.map((stage, index) => <option key={stage} value={index}>{stage}</option>)}
                      </select>
                    )}
                  </div>
                  {row.type === "litigation" && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <input value={row.plaintiff} placeholder="原告" onChange={(e) => patchRow(row.sourcePath, { plaintiff: e.target.value })} style={{ ...input, width: 110 }} />
                      <input value={row.defendant} placeholder="被告" onChange={(e) => patchRow(row.sourcePath, { defendant: e.target.value })} style={{ ...input, width: 110 }} />
                      <input value={row.court} placeholder="受理法院" onChange={(e) => patchRow(row.sourcePath, { court: e.target.value })} style={{ ...input, flex: 1, minWidth: 140 }} />
                      <input value={row.caseNumber} placeholder="案号" onChange={(e) => patchRow(row.sourcePath, { caseNumber: e.target.value })} style={{ ...input, flex: 1, minWidth: 140 }} />
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-dim)" }}>
                    {row.fileCount} 个文件 · {row.signals.join("；")} · 移入 {targetPreview(row)}
                  </div>
                </div>
              ))}
            </div>

            {(scan?.looseFiles.length ?? 0) > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>根目录散落文件</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {scan!.looseFiles.map((file) => (
                    <div key={file.path} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                      <select
                        value={looseAssign[file.path] ?? ""}
                        onChange={(e) => setLooseAssign((prev) => ({ ...prev, [file.path]: e.target.value }))}
                        style={input}
                        aria-label={`${file.name} 归并到`}
                      >
                        <option value="">不处理</option>
                        {rows.filter((row) => row.accept).map((row) => (
                          <option key={row.sourcePath} value={row.sourcePath}>并入「{row.title}」材料</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--accent)" }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button
                onClick={close}
                disabled={phase === "applying"}
                style={{ ...input, cursor: "pointer", color: "var(--text-muted)" }}
              >
                取消
              </button>
              <button
                onClick={() => void apply()}
                disabled={phase === "applying" || acceptedCount === 0}
                style={{
                  border: 0,
                  borderRadius: 4,
                  padding: "8px 14px",
                  background: "var(--accent)",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: phase === "applying" || acceptedCount === 0 ? "not-allowed" : "pointer",
                  opacity: phase === "applying" || acceptedCount === 0 ? 0.6 : 1,
                }}
              >
                {phase === "applying" ? "正在整理…" : `整理 ${acceptedCount} 个案件`}
              </button>
            </div>
          </>
        )}

        {phase === "done" && applyResult && (
          <>
            <p style={{ fontSize: 13, color: "var(--text)" }}>
              已导入 {applyResult.casesCreated} 个案件：推断期限 {applyResult.deadlinesCreated} 个、
              日程 {applyResult.schedulesCreated} 个，并为每个案件创建了「核对整理结果」任务。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
              {applyResult.items.map((item) => (
                <div key={item.sourcePath} style={{ fontSize: 12, color: item.ok ? "var(--text-muted)" : "var(--accent)" }}>
                  {item.ok
                    ? `✓ ${item.title} → ${item.targetPath}${item.deadlines ? `（期限 ${item.deadlines}）` : ""}${item.schedules ? `（日程 ${item.schedules}）` : ""}`
                    : item.error === "skipped" ? `– 已跳过 ${item.sourcePath}` : `✗ ${item.sourcePath}：${item.error}`}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={close}
                style={{ border: 0, borderRadius: 4, padding: "8px 14px", background: "var(--accent)", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                完成
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
