// Swiss / International Typographic Style tokens for Mju.
// Single source of truth for the board/config components; colors resolve
// through the CSS variables in app/globals.css so every surface follows the
// active theme (paper / night).

export const colors = {
  // Backgrounds
  bg: "var(--bg)",
  bgSecondary: "var(--bg-panel)",
  bgTertiary: "var(--tool-bg)",
  card: "var(--bg)",

  // Borders — hairlines only, never shadows, for separation
  border: "var(--border)",
  borderLight: "var(--border)",

  // Text
  text: "var(--text)",
  textSecondary: "var(--text-muted)",
  textTertiary: "var(--text-dim)",
  textDim: "var(--text-dim)",

  // Accent: Swiss signal red — the only decorative color in the system
  accent: "var(--accent)",
  accentHover: "var(--accent-hover)",
  accentSoft: "var(--glow)",
  accentSofter: "var(--bg-subtle)",

  // Status (functional only, data contexts)
  success: "#2f9e6e",
  successSoft: "rgba(47,158,110,.1)",
  warning: "#d97706",
  warningSoft: "rgba(217,119,6,.1)",
  error: "#dc2626",
  errorSoft: "rgba(220,38,38,.08)",

  // Shadows: none for separation; a single restrained lift for modals
  shadowSm: "none",
  shadow: "none",
  shadowHover: "none",
  shadowLg: "0 24px 64px rgba(0,0,0,.18)",
};

export const radius = {
  sm: 2,
  md: 2,
  lg: 4,
  xl: 4,
  full: 9999,
};

// Micro-label: uppercase letterspaced grotesque — the workhorse of Swiss UI
export function microLabel(color: string = colors.textTertiary): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: ".1em",
    textTransform: "uppercase",
    color,
  };
}

export const animations = {
  fadeIn: "mju-fade-in .2s ease-out",
  scaleIn: "mju-scale-in .25s cubic-bezier(.16,1,.3,1)",
  slideUp: "mju-slide-up .3s cubic-bezier(.16,1,.3,1)",
  slideUpSlow: "mju-slide-up .4s cubic-bezier(.16,1,.3,1)",
};

export const animationCss = `
@keyframes mju-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes mju-scale-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mju-slide-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mju-pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.65; }
}
@keyframes mju-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

export function modalBackdrop(): React.CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    padding: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,.32)",
    animation: animations.fadeIn,
  };
}

export function modalPanel(width: number | string, height: number | string): React.CSSProperties {
  return {
    width,
    height,
    maxWidth: "100%",
    maxHeight: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: radius.sm,
    background: colors.card,
    boxShadow: colors.shadowLg,
    border: `1px solid ${colors.border}`,
    animation: animations.scaleIn,
  };
}

export function buttonPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 16px",
    border: "none",
    borderRadius: radius.sm,
    background: disabled ? colors.bgSecondary : colors.accent,
    color: disabled ? colors.textTertiary : "#fff",
    fontWeight: 600,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background .15s ease",
  };
}

export function buttonSecondary(): React.CSSProperties {
  return {
    padding: "10px 14px",
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    background: colors.card,
    color: colors.textSecondary,
    fontWeight: 500,
    fontSize: 13,
    cursor: "pointer",
    transition: "border-color .15s ease, color .15s ease",
  };
}

export function buttonDanger(): React.CSSProperties {
  return {
    padding: "10px 14px",
    border: `1px solid ${colors.error}`,
    borderRadius: radius.sm,
    background: "transparent",
    color: colors.error,
    fontWeight: 500,
    fontSize: 13,
    cursor: "pointer",
    transition: "border-color .15s ease",
  };
}

export function inputBase(): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    background: colors.card,
    color: colors.text,
    fontSize: 13,
    outline: "none",
    transition: "border-color .15s ease",
  };
}

export function inputFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void {
  e.currentTarget.style.borderColor = colors.accent;
}

export function inputBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void {
  e.currentTarget.style.borderColor = colors.border;
}

export function cardBase(): React.CSSProperties {
  return {
    padding: 16,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    background: colors.card,
    transition: "border-color .15s ease",
  };
}

export function cardHover(e: React.MouseEvent<HTMLElement>): void {
  e.currentTarget.style.borderColor = colors.textTertiary;
}

export function cardLeave(e: React.MouseEvent<HTMLElement>): void {
  e.currentTarget.style.borderColor = colors.border;
}

export function tagBase(bgColor: string, textColor: string): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: ".06em",
    padding: "3px 8px",
    borderRadius: radius.sm,
    background: bgColor,
    color: textColor,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  };
}
