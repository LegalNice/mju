"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { Case, CaseType, CaseStatus } from "@/lib/mju-models";
import { colors, radius, animationCss, modalBackdrop, modalPanel, buttonPrimary, inputBase, inputFocus, inputBlur, cardBase, cardHover, cardLeave, tagBase } from "@/lib/design-system";

type CaseBoardProps = {
  cwd: string;
  onClose: () => void;
  onSelectCase?: (caseItem: Case) => void;
};

const typeLabels: Record<CaseType, string> = {
  advisory: "顾问项目",
  litigation: "诉讼案件",
};

const statusLabels: Record<CaseStatus, string> = {
  active: "进行中",
  dormant: "休眠",
  closed: "已结案",
};

const statusConfig: Record<CaseStatus, { bg: string; text: string; dot: string }> = {
  active: { bg: colors.successSoft, text: colors.success, dot: colors.success },
  dormant: { bg: colors.bgSecondary, text: colors.textSecondary, dot: colors.textTertiary },
  closed: { bg: colors.bgSecondary, text: colors.textTertiary, dot: colors.textDim },
};

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function GavelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m14 13-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10" />
      <path d="m16 16 6-6" />
      <path d="m8 8 6-6" />
      <path d="m9 7 8 8" />
      <path d="m21 11-8-8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CaseBoard({ cwd, onClose, onSelectCase }: CaseBoardProps) {
  const isMobile = useIsMobile();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Case | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<CaseType>("advisory");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/cases?cwd=${encodeURIComponent(cwd)}`);
      const data = await response.json() as { cases?: Case[]; error?: string };
      if (!response.ok) throw new Error(data.error || "无法加载案件");
      setCases(data.cases ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const map: Record<CaseType, Case[]> = { advisory: [], litigation: [] };
    for (const item of cases) {
      map[item.type].push(item);
    }
    return map;
  }, [cases]);

  const createCase = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, title: newTitle.trim(), type: newType }),
      });
      const data = await response.json() as { case?: Case; error?: string };
      if (!response.ok) throw new Error(data.error || "创建失败");
      setNewTitle("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const typeButtonStyle = (type: CaseType): React.CSSProperties => ({
    flex: 1,
    padding: "10px 12px",
    borderRadius: radius.md,
    fontSize: 13,
    fontWeight: newType === type ? 600 : 500,
    border: `1px solid ${newType === type ? colors.accent : colors.border}`,
    background: newType === type ? colors.accentSoft : colors.card,
    color: newType === type ? colors.accent : colors.textSecondary,
    cursor: "pointer",
    transition: "all .2s ease",
  });

  return (
    <>
      <style>{animationCss}</style>
      <div style={modalBackdrop()} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div style={modalPanel(isMobile ? "100%" : 980, isMobile ? "100%" : 700)}>
          {/* Header */}
          <header
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "24px 28px", borderBottom: `1px solid ${colors.borderLight}`,
              background: colors.card,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: colors.text }}>
                案件与项目
              </h2>
              <div style={{ marginTop: 4, fontSize: 14, color: colors.textSecondary }}>
                管理你的法律顾问和诉讼案件
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="关闭"
              style={{
                width: 36, height: 36, border: "none", borderRadius: radius.md,
                background: colors.bgSecondary, color: colors.textSecondary,
                fontSize: 22, lineHeight: 1, cursor: "pointer",
                display: "grid", placeItems: "center",
                transition: "background .2s ease, transform .2s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.border; e.currentTarget.style.transform = "scale(1.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.bgSecondary; e.currentTarget.style.transform = "scale(1)"; }}
            >
              ×
            </button>
          </header>

          <div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: isMobile ? "column" : "row" }}>
            {/* Sidebar */}
            <aside
              style={{
                width: isMobile ? "100%" : 300, flexShrink: 0, padding: 24,
                borderRight: isMobile ? "none" : `1px solid ${colors.borderLight}`,
                borderBottom: isMobile ? `1px solid ${colors.borderLight}` : "none",
                overflow: "auto",
                background: colors.bgTertiary,
              }}
            >
              <div style={{ fontSize: 12, color: colors.textTertiary, fontWeight: 600, letterSpacing: ".06em", marginBottom: 14, textTransform: "uppercase" }}>
                新建案件
              </div>
              <div
                style={{
                  padding: 16, borderRadius: radius.lg, background: colors.card,
                  border: `1px solid ${colors.borderLight}`,
                  animation: "mju-slide-up .35s cubic-bezier(.16,1,.3,1) .05s both",
                }}
              >
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="输入案件名称"
                  style={{ ...inputBase(), marginBottom: 12 }}
                  onFocus={inputFocus}
                  onBlur={inputBlur}
                />
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {(["advisory", "litigation"] as CaseType[]).map((type) => (
                    <button key={type} onClick={() => setNewType(type)} style={typeButtonStyle(type)}>
                      {typeLabels[type]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => void createCase()}
                  disabled={creating || !newTitle.trim()}
                  style={{
                    ...buttonPrimary(creating || !newTitle.trim()),
                    width: "100%",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                  onMouseEnter={(e) => { if (!creating && newTitle.trim()) { e.currentTarget.style.background = colors.accentHover; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                  onMouseLeave={(e) => { if (!creating && newTitle.trim()) { e.currentTarget.style.background = colors.accent; e.currentTarget.style.transform = "translateY(0)"; } }}
                >
                  <PlusIcon />
                  {creating ? "创建中…" : "创建案件"}
                </button>
              </div>

              <div style={{ marginTop: 28, fontSize: 12, color: colors.textTertiary, fontWeight: 600, letterSpacing: ".06em", marginBottom: 12, textTransform: "uppercase" }}>
                概览
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { icon: <FolderIcon />, count: grouped.advisory.length, label: "顾问项目", delay: ".1s" },
                  { icon: <GavelIcon />, count: grouped.litigation.length, label: "诉讼案件", delay: ".15s" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                      borderRadius: radius.lg, background: colors.card, border: `1px solid ${colors.borderLight}`,
                      animation: `mju-slide-up .35s cubic-bezier(.16,1,.3,1) ${item.delay} both`,
                      transition: "transform .2s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateX(4px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateX(0)"; }}
                  >
                    <span style={{ color: colors.accent, display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: radius.md, background: colors.accentSoft }}>
                      {item.icon}
                    </span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>{item.count}</div>
                      <div style={{ fontSize: 12, color: colors.textSecondary }}>{item.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            {/* Main content */}
            <main style={{ flex: 1, minWidth: 0, minHeight: 0, padding: 28, overflow: "auto", background: colors.bg }}>
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "20px 0" }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: 88, borderRadius: radius.lg, background: colors.bgSecondary,
                        animation: "mju-pulse-subtle 1.5s ease-in-out infinite",
                      }}
                    />
                  ))}
                </div>
              ) : error ? (
                <div style={{ color: colors.error, fontSize: 14, padding: "20px 0" }}>{error}</div>
              ) : cases.length === 0 ? (
                <div style={{ color: colors.textTertiary, fontSize: 15, padding: "80px 20px", textAlign: "center", lineHeight: 1.8 }}>
                  暂无案件<br />在左侧创建你的第一个案件
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  {(["advisory", "litigation"] as CaseType[]).map((type, typeIndex) => (
                    grouped[type].length > 0 && (
                      <div
                        key={type}
                        style={{ animation: `mju-slide-up .4s cubic-bezier(.16,1,.3,1) ${typeIndex * 0.08}s both` }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                          <span style={{ color: colors.accent, display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: radius.md, background: colors.accentSoft }}>
                            {type === "advisory" ? <FolderIcon /> : <GavelIcon />}
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>
                            {typeLabels[type]}
                          </span>
                          <span style={{ fontSize: 13, color: colors.textTertiary, background: colors.bgSecondary, padding: "2px 8px", borderRadius: radius.full }}>
                            {grouped[type].length}
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(260px, 1fr))", gap: 14 }}>
                          {grouped[type].map((item, index) => (
                            <article
                              key={item.id}
                              onClick={() => { setSelected(item); onSelectCase?.(item); }}
                              style={{
                                ...cardBase(),
                                padding: 18,
                                border: `1px solid ${selected?.id === item.id ? colors.accent : colors.borderLight}`,
                                background: selected?.id === item.id ? colors.accentSoft : colors.card,
                                cursor: "pointer",
                                animation: `mju-slide-up .35s cubic-bezier(.16,1,.3,1) ${0.1 + index * 0.04}s both`,
                              }}
                              onMouseEnter={cardHover}
                              onMouseLeave={cardLeave}
                            >
                              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: colors.text }}>
                                {item.title}
                              </div>
                              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <span style={tagBase(statusConfig[item.status].bg, statusConfig[item.status].text)}>
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusConfig[item.status].dot }} />
                                  {statusLabels[item.status]}
                                </span>
                                <span style={tagBase(colors.bgSecondary, colors.textSecondary)}>
                                  {item.stage}
                                </span>
                              </div>
                              {item.court && (
                                <div style={{ marginTop: 12, fontSize: 12, color: colors.textSecondary, display: "flex", alignItems: "center", gap: 6 }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg>
                                  {item.court}
                                </div>
                              )}
                              {item.caseNumber && (
                                <div style={{ marginTop: 6, fontSize: 11, color: colors.textTertiary, fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                                  {item.caseNumber}
                                </div>
                              )}
                            </article>
                          ))}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
