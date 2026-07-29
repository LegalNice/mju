"use client";

import { useEffect, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";

type Changelog = { version: string; content: string };

export function ChangelogConfig({ onClose }: { onClose: () => void }) {
  const [changelog, setChangelog] = useState<Changelog | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/changelog")
      .then((response) => response.ok ? response.json() as Promise<Changelog> : Promise.reject(new Error("Failed to load changelog")))
      .then((data) => { if (!cancelled) setChangelog(data); })
      .catch(() => { if (!cancelled) setChangelog({ version: "", content: "" }); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, background: "rgba(0,0,0,.32)" }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section style={{ width: 560, maxWidth: "100%", maxHeight: "78vh", overflow: "auto", padding: 24, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", boxShadow: "0 24px 64px rgba(0,0,0,.18)" }} aria-label="更新日志">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ color: "var(--accent)", fontSize: 10, fontWeight: 700, letterSpacing: ".12em" }}>MJU — CHANGELOG</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>CHANGELOG{changelog?.version ? ` · v${changelog.version}` : ""}</h2>
          </div>
          <button onClick={onClose} aria-label="关闭更新日志" style={{ border: 0, background: "transparent", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>×</button>
        </header>
        {changelog === null ? (
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>正在加载…</p>
        ) : changelog.content ? (
          <MarkdownBody className="markdown-changelog">{changelog.content}</MarkdownBody>
        ) : (
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>暂未提供更新记录。</p>
        )}
      </section>
    </div>
  );
}
