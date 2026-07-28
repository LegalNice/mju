"use client";

import { useEffect, useState } from "react";

interface MineruConfigState {
  apiToken: string;
  modelVersion: "pipeline" | "vlm" | "MinerU-HTML";
  enableOcr: boolean;
  enableTable: boolean;
  enableFormula: boolean;
}

const MODEL_OPTIONS: Array<{ value: MineruConfigState["modelVersion"]; label: string }> = [
  { value: "vlm", label: "VLM（推荐，复杂版式）" },
  { value: "pipeline", label: "Pipeline（速度优先）" },
  { value: "MinerU-HTML", label: "MinerU-HTML（HTML 源文件）" },
];

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `请求失败（${res.status}）`);
  }
  return data;
}

export function MineruConfig({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<MineruConfigState>({
    apiToken: "",
    modelVersion: "vlm",
    enableOcr: false,
    enableTable: true,
    enableFormula: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mju-config")
      .then((res) => readJson(res))
      .then((data) => {
        if (cancelled) return;
        const mineru = (data.mineru ?? {}) as Partial<MineruConfigState>;
        setConfig({
          apiToken: mineru.apiToken ?? "",
          modelVersion: mineru.modelVersion ?? "vlm",
          enableOcr: mineru.enableOcr ?? false,
          enableTable: mineru.enableTable ?? true,
          enableFormula: mineru.enableFormula ?? true,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const patch: Partial<MineruConfigState> = {
        apiToken: config.apiToken.trim() || undefined,
        modelVersion: config.modelVersion,
        enableOcr: config.enableOcr,
        enableTable: config.enableTable,
        enableFormula: config.enableFormula,
      };
      await fetch("/api/mju-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mineru: patch }),
      }).then(readJson);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    background: "var(--bg-panel)",
    border: "1px solid var(--border)",
    borderRadius: 2,
    color: "var(--text)",
    fontSize: 12,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-muted)",
    fontWeight: 600,
    letterSpacing: ".04em",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        background: "rgba(0,0,0,.32)",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 520,
          maxWidth: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
          border: "1px solid var(--border)",
          borderRadius: 2,
          background: "var(--bg)",
          boxShadow: "0 24px 64px rgba(0,0,0,.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ color: "var(--accent)", fontSize: 10, fontWeight: 700, letterSpacing: ".12em" }}>
              MJU — MINERU
            </div>
            <h2 style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
              文档转 Markdown
            </h2>
            <p style={{ margin: "7px 0 0", color: "var(--text-muted)", fontSize: 12 }}>
              在 <a href="https://mineru.net/apiManage" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>mineru.net</a> 创建 Token 后填入，上传 PDF/DOCX 即可自动转为 MD 存入案卷。
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ border: 0, background: "transparent", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div style={{ marginTop: 24, fontSize: 12, color: "var(--text-muted)" }}>加载中…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
            <div>
              <div style={labelStyle}>API Token</div>
              <input
                type="password"
                value={config.apiToken}
                onChange={(e) => setConfig((c) => ({ ...c, apiToken: e.target.value }))}
                placeholder="sk-xxxxxxxx"
                style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
              />
            </div>

            <div>
              <div style={labelStyle}>模型版本</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {MODEL_OPTIONS.map((opt) => {
                  const active = config.modelVersion === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setConfig((c) => ({ ...c, modelVersion: opt.value }))}
                      style={{
                        padding: "6px 10px",
                        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: 2,
                        background: "transparent",
                        color: active ? "var(--accent)" : "var(--text)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config.enableOcr}
                  onChange={(e) => setConfig((c) => ({ ...c, enableOcr: e.target.checked }))}
                />
                <span style={{ fontSize: 12 }}>启用 OCR（扫描件/图片 PDF）</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config.enableTable}
                  onChange={(e) => setConfig((c) => ({ ...c, enableTable: e.target.checked }))}
                />
                <span style={{ fontSize: 12 }}>识别表格</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config.enableFormula}
                  onChange={(e) => setConfig((c) => ({ ...c, enableFormula: e.target.checked }))}
                />
                <span style={{ fontSize: 12 }}>识别公式</span>
              </label>
            </div>

            {error && <div style={{ fontSize: 12, color: "var(--accent)" }}>{error}</div>}

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: 2,
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "保存中…" : saved ? "已保存 ✓" : "保存"}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "8px 16px",
                  border: "1px solid var(--border)",
                  borderRadius: 2,
                  background: "transparent",
                  color: "var(--text-muted)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
