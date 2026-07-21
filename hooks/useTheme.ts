"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ThemeName = "paper" | "atelier" | "kimi" | "night" | "terminal";

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): ThemeName {
  if (typeof document === "undefined") return "paper";
  const theme = document.documentElement.dataset.theme as ThemeName | undefined;
  if (theme === "atelier" || theme === "kimi" || theme === "night" || theme === "terminal") return theme;
  return document.documentElement.classList.contains("dark") ? "night" : "paper";
}

function getServerSnapshot(): ThemeName {
  return "paper";
}

type ToggleOrigin = { x: number; y: number };

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: ThemeName) => {
    document.documentElement.dataset.theme = next;
    document.documentElement.classList.toggle("dark", next === "night" || next === "terminal");
    try {
      localStorage.setItem("mju-visual-theme", next);
      localStorage.setItem("mju-theme", next === "night" || next === "terminal" ? "dark" : "light");
    } catch {
      // ignore storage errors
    }
    listeners.forEach((cb) => cb());
  }, []);

  const toggleTheme = useCallback((origin?: ToggleOrigin) => {
    const next: ThemeName = getSnapshot() === "night" || getSnapshot() === "terminal" ? "paper" : "night";

    const apply = () => {
      setTheme(next);
    };

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const supportsVT = typeof document.startViewTransition === "function";

    if (!supportsVT || reduceMotion) {
      apply();
      return;
    }

    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 450,
            easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        // transition cancelled — ignore
      });
  }, [setTheme]);

  return { theme, setTheme, toggleTheme, isDark: theme === "night" || theme === "terminal" };
}
