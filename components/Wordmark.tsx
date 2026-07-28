/**
 * Brand lockup: a restrained serif μ mark followed by "Mju AGENTS". The
 * distinctive Greek mark stays central to the identity without relying on a
 * handwritten font, while the wordmark stays crisp in the regular UI font.
 * Used on the entry hero, AppNav, and the chat empty state.
 */
export function Wordmark({ fontSize = 15 }: { fontSize?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: fontSize * 0.45, userSelect: "none" }}>
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: fontSize * 1.34,
          fontWeight: 700,
          fontStyle: "italic",
          letterSpacing: "-0.14em",
          lineHeight: 0.9,
          color: "var(--accent)",
          transform: "translateY(0.02em)",
        }}
      >
        μ
      </span>
      <span style={{ fontWeight: 700, fontSize, color: "var(--text)", letterSpacing: "0.025em" }}>
        Mju AGENTS
      </span>
    </span>
  );
}
