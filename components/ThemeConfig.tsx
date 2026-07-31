"use client";

import { useTheme, type ThemeName } from "@/hooks/useTheme";

const themes: Array<{ id: ThemeName; name: string; note: string; colors: string[] }> = [
  { id: "paper", name: "Paper", note: "暖纸、黑墨、圆珠笔蓝 — 档案纸默认", colors: ["#faf6ec", "#f2ecdc", "#2b3fd6"] },
  { id: "night", name: "Night", note: "暖黑纸、白墨、同一枚蓝", colors: ["#1a1712", "#221e17", "#7d92ff"] },
];

export function ThemeConfig({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  return <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, background: "rgba(0,0,0,.32)" }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div style={{ width: 480, maxWidth: "100%", padding: 24, border: "1px solid var(--border)", borderRadius: 2, background: "var(--bg)", boxShadow: "var(--overlay-shadow)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}><div><div style={{ color: "var(--accent)", fontSize: 10, fontWeight: 700, letterSpacing: ".12em" }}>MJU — THEME</div><h2 style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>外观</h2><p style={{ margin: "7px 0 0", color: "var(--text-muted)", fontSize: 12 }}>保存在本机，下次打开自动恢复。</p></div><button onClick={onClose} style={{ border: 0, background: "transparent", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>×</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 20 }}>{themes.map((item) => <button key={item.id} onClick={() => setTheme(item.id)} style={{ padding: 12, textAlign: "left", border: `1px solid ${theme === item.id ? "var(--accent)" : "var(--border)"}`, borderRadius: 2, background: "var(--bg)", color: "var(--text)", cursor: "pointer" }}><div style={{ display: "flex", gap: 4, height: 28, marginBottom: 10 }}>{item.colors.map((color) => <span key={color} style={{ flex: 1, borderRadius: 2, background: color, border: "1px solid var(--border)" }} />)}</div><div style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".04em" }}>{item.name}{theme === item.id && <span style={{ float: "right", color: "var(--accent)" }}>✓</span>}</div><div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 11 }}>{item.note}</div></button>)}</div>
    </div>
  </div>;
}
