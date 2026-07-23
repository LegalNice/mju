// Kimi-inspired warm minimal design system for Mju
// 暖调、干净、有呼吸感

export const colors = {
  // Backgrounds
  bg: "#fdfcfb",           // 主背景：暖白
  bgSecondary: "#f7f5f2",  // 次背景：浅暖灰
  bgTertiary: "#faf9f7",   // 第三背景：更浅的暖白
  card: "#ffffff",         // 卡片：纯白

  // Borders
  border: "#e8e4df",       // 主边框：暖灰
  borderLight: "#f0edea",  // 浅边框

  // Text
  text: "#1a1a1a",         // 主文字：近黑
  textSecondary: "#5c5c5c",// 次要文字：深灰
  textTertiary: "#9c9c9c", // 第三文字：浅灰
  textDim: "#c4c4c4",      // 最浅文字

  // Accent: 暖橙红（Kimi 感）
  accent: "#d45d3a",
  accentHover: "#c24a2a",
  accentSoft: "rgba(212,93,58,.08)",
  accentSofter: "rgba(212,93,58,.04)",

  // Status
  success: "#2f9e6e",
  successSoft: "rgba(47,158,110,.1)",
  warning: "#d97706",
  warningSoft: "rgba(217,119,6,.1)",
  error: "#dc2626",
  errorSoft: "rgba(220,38,38,.08)",

  // Shadows
  shadowSm: "0 1px 3px rgba(0,0,0,.04)",
  shadow: "0 4px 20px rgba(0,0,0,.05)",
  shadowHover: "0 8px 32px rgba(0,0,0,.08)",
  shadowLg: "0 16px 48px rgba(0,0,0,.1)",
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const animations = {
  fadeIn: "mju-fade-in .25s ease-out",
  scaleIn: "mju-scale-in .3s cubic-bezier(.16,1,.3,1)",
  slideUp: "mju-slide-up .35s cubic-bezier(.16,1,.3,1)",
  slideUpSlow: "mju-slide-up .45s cubic-bezier(.16,1,.3,1)",
};

export const animationCss = `
@keyframes mju-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes mju-scale-in {
  from { opacity: 0; transform: scale(0.97) translateY(6px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
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
    background: "rgba(0,0,0,.28)",
    backdropFilter: "blur(10px)",
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
    borderRadius: radius.xl,
    background: colors.card,
    boxShadow: "0 24px 80px rgba(0,0,0,.14)",
    border: `1px solid ${colors.borderLight}`,
    animation: animations.scaleIn,
  };
}

export function buttonPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 16px",
    border: "none",
    borderRadius: radius.md,
    background: disabled ? colors.bgSecondary : colors.accent,
    color: disabled ? colors.textTertiary : "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all .2s ease",
  };
}

export function buttonSecondary(): React.CSSProperties {
  return {
    padding: "10px 14px",
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    background: colors.card,
    color: colors.textSecondary,
    fontWeight: 500,
    fontSize: 13,
    cursor: "pointer",
    transition: "all .2s ease",
  };
}

export function buttonDanger(): React.CSSProperties {
  return {
    padding: "10px 14px",
    border: `1px solid ${colors.error}`,
    borderRadius: radius.md,
    background: "transparent",
    color: colors.error,
    fontWeight: 500,
    fontSize: 13,
    cursor: "pointer",
    transition: "all .2s ease",
  };
}

export function inputBase(): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 13px",
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    background: colors.card,
    color: colors.text,
    fontSize: 14,
    outline: "none",
    transition: "border-color .2s ease, box-shadow .2s ease",
  };
}

export function inputFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void {
  e.currentTarget.style.borderColor = colors.accent;
  e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.accentSoft}`;
}

export function inputBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void {
  e.currentTarget.style.borderColor = colors.border;
  e.currentTarget.style.boxShadow = "none";
}

export function cardBase(): React.CSSProperties {
  return {
    padding: 16,
    borderRadius: radius.lg,
    border: `1px solid ${colors.borderLight}`,
    background: colors.card,
    boxShadow: colors.shadowSm,
    transition: "all .25s cubic-bezier(.16,1,.3,1)",
  };
}

export function cardHover(e: React.MouseEvent<HTMLElement>): void {
  e.currentTarget.style.boxShadow = colors.shadowHover;
  e.currentTarget.style.transform = "translateY(-2px)";
}

export function cardLeave(e: React.MouseEvent<HTMLElement>): void {
  e.currentTarget.style.boxShadow = colors.shadowSm;
  e.currentTarget.style.transform = "translateY(0)";
}

export function tagBase(bgColor: string, textColor: string): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: radius.full,
    background: bgColor,
    color: textColor,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  };
}
