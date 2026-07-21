"use client";

import { useTheme, type ThemeName } from "@/hooks/useTheme";

const themes: Array<{ id: ThemeName; name: string; note: string; colors: string[] }> = [
  { id: "paper", name: "档案纸张", note: "Mju 默认工作台", colors: ["#f4ecd9", "#e9ddc6", "#8e3045"] },
  { id: "atelier", name: "复古编辑室", note: "酒红、黄铜与奶油纸", colors: ["#f4ead8", "#30201f", "#7f233c"] },
  { id: "kimi", name: "月面明亮", note: "清爽、留白与蓝色工作台", colors: ["#ffffff", "#f8f9fb", "#1677ff"] },
  { id: "terminal", name: "电子仪表盘", note: "CRT 终端与荧光状态灯", colors: ["#071111", "#0d1c1c", "#b9f33b"] },
  { id: "night", name: "夜间档案", note: "深棕、金色与低光阅读", colors: ["#1e1719", "#2a2022", "#d2a15d"] },
];

export function ThemeConfig({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  return <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, background: "rgba(35,23,25,.5)", backdropFilter: "blur(8px)" }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div style={{ width: 620, maxWidth: "100%", padding: 24, border: "1px solid var(--border)", borderRadius: 18, background: "var(--bg)", boxShadow: "0 28px 90px rgba(35,23,25,.28)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}><div><div style={{ color: "var(--accent)", fontSize: 10, fontWeight: 750, letterSpacing: ".14em" }}>MJU / THEMES</div><h2 style={{ margin: "6px 0 0", fontFamily: "Georgia, serif", fontSize: 22 }}>选择工作台主题</h2><p style={{ margin: "7px 0 0", color: "var(--text-muted)", fontSize: 12 }}>主题会保存在本机，下次打开 Mju Agents 自动恢复。</p></div><button onClick={onClose} style={{ border: 0, background: "transparent", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>×</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 22 }}>{themes.map((item) => <button key={item.id} onClick={() => setTheme(item.id)} style={{ padding: 13, textAlign: "left", border: `1px solid ${theme === item.id ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, background: theme === item.id ? "color-mix(in srgb, var(--accent) 8%, var(--bg-panel))" : "var(--bg-panel)", color: "var(--text)", cursor: "pointer", boxShadow: theme === item.id ? "0 0 0 3px var(--glow)" : "none" }}><div style={{ display: "flex", gap: 5, height: 30, marginBottom: 12 }}>{item.colors.map((color) => <span key={color} style={{ flex: 1, borderRadius: 6, background: color, border: "1px solid color-mix(in srgb, var(--text) 12%, transparent)" }} />)}</div><div style={{ fontWeight: 700, fontSize: 13 }}>{item.name}{theme === item.id && <span style={{ float: "right", color: "var(--accent)" }}>✓</span>}</div><div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 11 }}>{item.note}</div></button>)}</div>
    </div>
  </div>;
}
