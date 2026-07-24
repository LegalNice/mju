/**
 * Brand lockup: handwritten red μ followed by "Mju AGENTS" in the regular UI
 * font. The μ uses the platform handwriting font (Snell Roundhand on macOS)
 * with a cursive fallback — no bundled font files. Used on the entry hero,
 * AppNav, and the chat empty state.
 */
export function Wordmark({ fontSize = 15 }: { fontSize?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: fontSize * 0.45, userSelect: "none" }}>
      <span
        aria-hidden="true"
        style={{
          fontFamily: '"Snell Roundhand", "Bradley Hand", "Segoe Script", cursive',
          fontSize: fontSize * 1.5,
          lineHeight: 0.8,
          color: "var(--accent)",
          transform: "translateY(0.05em)",
        }}
      >
        μ
      </span>
      <span style={{ fontWeight: 700, fontSize, color: "var(--text)", letterSpacing: "-0.01em" }}>
        Mju AGENTS
      </span>
    </span>
  );
}
