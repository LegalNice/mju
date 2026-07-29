"use client";

import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { usePathname } from "next/navigation";
import { LanguageToggle, useI18n } from "./I18nProvider";

/**
 * Shared top navigation for the workbench pages (Board / Dates / task detail).
 * The entry page renders without chrome until a task is launched.
 */
export function AppNav({ boardHref }: { boardHref?: string }) {
  const pathname = usePathname();
  const { text } = useI18n();
  const items = [
    { label: text("案件", "Cases"), href: boardHref ?? "/board", match: (p: string) => p.startsWith("/board") || p.startsWith("/task") },
    { label: text("日程", "Dates"), href: "/dates", match: (p: string) => p.startsWith("/dates") },
  ];
  return (
    <header
      style={{
        height: 52,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <Wordmark fontSize={15} />
      </Link>
      <nav style={{ display: "flex", gap: 20, alignItems: "center" }}>
        {items.map((item) => {
          const on = item.match(pathname);
          return (
            <Link
              key={item.label}
              href={item.href}
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: on ? "var(--text)" : "var(--text-muted)",
                textDecorationLine: on ? "underline" : "none",
                textDecorationColor: "var(--accent)",
                textUnderlineOffset: 5,
                textDecorationThickness: 2,
              }}
            >
              {item.label}
            </Link>
          );
        })}
        <LanguageToggle />
      </nav>
    </header>
  );
}
