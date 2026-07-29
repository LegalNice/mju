"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";

type UpdateInfo = {
  currentVersion: string;
  latestVersion: string | null;
  state: "up-to-date" | "update-available" | "unavailable";
  installMode: "global" | "npx" | "local" | "unknown";
  canUpdate: boolean;
  releaseNotes: string | null;
  message?: string;
  lastUpdate: { status: "updated" | "failed"; message?: string } | null;
};

type Changelog = { version: string; content: string; update: UpdateInfo };

const POLL_INTERVAL_MS = 1_000;
const RESTART_TIMEOUT_MS = 90_000;
const UNAVAILABLE_UPDATE: UpdateInfo = {
  currentVersion: "",
  latestVersion: null,
  state: "unavailable",
  installMode: "unknown",
  canUpdate: false,
  releaseNotes: null,
  message: "暂时无法检查更新。",
  lastUpdate: null,
};

export function ChangelogConfig({ onClose }: { onClose: () => void }) {
  const [changelog, setChangelog] = useState<Changelog | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/changelog")
      .then((response) => response.ok ? response.json() as Promise<Changelog> : Promise.reject(new Error("Failed to load changelog")))
      .then((data) => { if (!cancelled) setChangelog(data); })
      .catch(() => { if (!cancelled) setChangelog({ version: "", content: "", update: UNAVAILABLE_UPDATE }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
  }, []);

  const requestUpdate = async () => {
    if (updating) return;
    setUpdating(true);
    setUpdateMessage("正在下载更新，Mju 将自动重启…");
    try {
      const response = await fetch("/api/mju-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update" }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "无法开始更新");

      const deadline = Date.now() + RESTART_TIMEOUT_MS;
      stopPolling();
      pollTimer.current = setInterval(() => {
        void fetch("/api/changelog", { cache: "no-store" })
          .then((res) => res.ok ? res.json() as Promise<Changelog> : Promise.reject(new Error("Mju is restarting")))
          .then((next) => {
            if (!next.update.lastUpdate) return;
            stopPolling();
            if (next.update.lastUpdate.status === "updated") {
              window.location.reload();
              return;
            }
            setChangelog(next);
            setUpdating(false);
            setUpdateMessage(next.update.lastUpdate.message || "更新失败，请稍后重试。");
          })
          .catch(() => {
            if (Date.now() <= deadline) return;
            stopPolling();
            setUpdating(false);
            setUpdateMessage("等待重启超时，请刷新页面后重试。");
          });
      }, POLL_INTERVAL_MS);
    } catch (error) {
      setUpdating(false);
      setUpdateMessage(error instanceof Error ? error.message : "无法开始更新");
    }
  };

  const update = changelog?.update;

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
        {update && (
          <section style={{ marginBottom: 18, padding: 14, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)" }}>
            {update.state === "update-available" ? (
              <>
                <div style={{ color: "var(--accent)", fontSize: 12, fontWeight: 700 }}>发现新版本 · v{update.latestVersion}</div>
                <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>当前 v{update.currentVersion}。更新会下载最新正式版并自动重启 Mju。</p>
                {update.canUpdate ? (
                  <button onClick={() => void requestUpdate()} disabled={updating} style={{ marginTop: 12, border: 0, borderRadius: 4, padding: "8px 12px", background: "var(--accent)", color: "white", fontSize: 12, fontWeight: 700, cursor: updating ? "wait" : "pointer", opacity: updating ? .7 : 1 }}>
                    {updating ? "正在更新…" : "更新并重启"}
                  </button>
                ) : update.installMode === "npx" ? (
                  <p style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: 12 }}>当前通过 npx 临时运行。关闭 Mju 后重新运行 <code>npx --yes @tttangerine/mju@latest</code> 即可。</p>
                ) : (
                  <p style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: 12 }}>当前为源码或非全局安装运行，不执行全局更新。</p>
                )}
                {update.releaseNotes && <div style={{ marginTop: 12 }}><MarkdownBody className="markdown-changelog">{update.releaseNotes}</MarkdownBody></div>}
              </>
            ) : update.state === "up-to-date" ? (
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12 }}>已是最新版 v{update.currentVersion}。</p>
            ) : (
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12 }}>{update.message || "暂时无法检查更新。"}</p>
            )}
            {update.lastUpdate?.status === "failed" && !updating && <p style={{ margin: "10px 0 0", color: "#b42318", fontSize: 12 }}>{update.lastUpdate.message || "更新失败，请稍后重试。"}</p>}
            {updateMessage && <p style={{ margin: "10px 0 0", color: updating ? "var(--text-muted)" : "#b42318", fontSize: 12 }}>{updateMessage}</p>}
          </section>
        )}
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
