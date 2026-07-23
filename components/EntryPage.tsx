"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Case as MjuCase } from "@/lib/mju-models";

const LS_CWD = "mju-entry-cwd";
const LS_LAST_CASE = "mju-last-case";
const INBOX_TITLE = "通用任务";

interface ProjectSummary {
  cwd: string;
  name: string;
  caseCount: number;
  isObsidianVault: boolean;
  updatedAt: string;
}

/** Manual chip override: a concrete case, the inbox, or nothing (auto-detect). */
type Pinned = { kind: "case"; value: MjuCase } | { kind: "inbox" } | null;

const micro: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: ".12em",
  textTransform: "uppercase",
};

function searchableFields(c: MjuCase): string[] {
  const raw = [
    c.title,
    c.parties?.plaintiff,
    c.parties?.defendant,
    ...(c.parties?.other ?? []),
    c.court,
    c.caseNumber,
  ];
  return raw.filter((f): f is string => Boolean(f && f.trim()));
}

/**
 * Score every case by how many of its searchable fields appear as substrings
 * in the instruction text (only fields ≥ 2 chars count). The case with the
 * longest matched field wins; ties break on the number of matched fields.
 * Returns null when nothing matched (no field ≥ 2 chars found in the text).
 */
function detectCase(cases: MjuCase[], text: string): MjuCase | null {
  let best: MjuCase | null = null;
  let bestLongest = 1; // a winning match needs a field of at least 2 chars
  let bestCount = 0;
  for (const c of cases) {
    let longest = 0;
    let count = 0;
    for (const field of searchableFields(c)) {
      if (field.length >= 2 && text.includes(field)) {
        count++;
        if (field.length > longest) longest = field.length;
      }
    }
    if (longest > bestLongest || (longest === bestLongest && longest > 1 && count > bestCount)) {
      best = c;
      bestLongest = longest;
      bestCount = count;
    }
  }
  return best;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `请求失败（${res.status}）`);
  }
  return data;
}

export function EntryPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [cases, setCases] = useState<MjuCase[]>([]);
  const [text, setText] = useState("");
  const [detected, setDetected] = useState<MjuCase | null>(null);
  const [pinned, setPinned] = useState<Pinned>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Load projects once; prefer the persisted cwd when it still exists.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/projects");
        const data = (await res.json()) as { projects?: ProjectSummary[] };
        if (cancelled) return;
        const list = data.projects ?? [];
        setProjects(list);
        const stored = localStorage.getItem(LS_CWD);
        const fromStore = stored ? list.find((p) => p.cwd === stored) : undefined;
        if (fromStore) setProject(fromStore);
        else if (list.length === 1) setProject(list[0]);
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the selection and load cases + default model for the project.
  useEffect(() => {
    if (!project) return;
    localStorage.setItem(LS_CWD, project.cwd);
    setDetected(null);
    setPinned(null);
    setMenuOpen(false);

    let cancelled = false;
    fetch(`/api/cases?cwd=${encodeURIComponent(project.cwd)}`)
      .then((res) => (res.ok ? res.json() : { cases: [] }))
      .then((data: { cases?: MjuCase[] }) => {
        if (!cancelled) setCases(data.cases ?? []);
      })
      .catch(() => {
        if (!cancelled) setCases([]);
      });
    fetch(`/api/models?cwd=${encodeURIComponent(project.cwd)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { defaultModel?: { provider: string; modelId: string } | null } | null) => {
        if (cancelled || !data?.defaultModel) return;
        setModelLabel(`${data.defaultModel.provider} · ${data.defaultModel.modelId}`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project]);

  // Close the case dropdown on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const scheduleDetect = useCallback(
    (value: string) => {
      if (detectTimer.current) clearTimeout(detectTimer.current);
      detectTimer.current = setTimeout(() => {
        // A manual override suspends auto-detection until the text is cleared.
        if (pinned) return;
        const trimmed = value.trim();
        setDetected(trimmed ? detectCase(cases, trimmed) : null);
      }, 200);
    },
    [cases, pinned],
  );

  const onChangeText = (value: string) => {
    setText(value);
    setError(null);
    if (!value.trim()) {
      // Clearing the text releases the manual override and resumes auto-detection.
      setPinned(null);
      setDetected(null);
      setMenuOpen(false);
      if (detectTimer.current) clearTimeout(detectTimer.current);
      return;
    }
    scheduleDetect(value);
  };

  const ensureInbox = useCallback(async (): Promise<MjuCase> => {
    if (!project) throw new Error("尚未选择项目");
    const res = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: project.cwd, action: "ensure_inbox" }),
    });
    const data = await readJson(res);
    return data.case as MjuCase;
  }, [project]);

  const chipTitle = pinned?.kind === "case" ? pinned.value.title
    : pinned?.kind === "inbox" ? INBOX_TITLE
    : detected ? detected.title
    : INBOX_TITLE;
  const showChip = Boolean(text.trim());

  const launch = async () => {
    const instruction = text.trim();
    if (!instruction || launching || !project) return;
    setLaunching(true);
    setError(null);
    try {
      const targetCase = pinned?.kind === "case" ? pinned.value
        : pinned?.kind === "inbox" ? await ensureInbox()
        : detected ?? (await ensureInbox());

      const agentRes = await fetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: targetCase.vaultPath, type: "prompt", message: instruction }),
      });
      const agentData = await readJson(agentRes);
      const sessionId = agentData.sessionId as string;

      const taskRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd: project.cwd,
          caseId: targetCase.id,
          title: instruction.slice(0, 20),
          detail: instruction,
          assignee: "auto",
          status: "进行中",
          sessionId,
          originPrompt: instruction,
        }),
      });
      const taskData = await readJson(taskRes);
      const task = taskData.task as { id: string };

      localStorage.setItem(LS_LAST_CASE, JSON.stringify({ cwd: project.cwd, caseId: targetCase.id }));
      setLeaving(true);
      setTimeout(() => {
        router.push(
          `/board/${targetCase.id}?new=${task.id}&cwd=${encodeURIComponent(project.cwd)}`,
        );
      }, 450);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLaunching(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void launch();
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        color: "var(--text)",
        padding: 24,
        transition: "opacity .4s ease, transform .5s cubic-bezier(.16,1,.3,1)",
        opacity: leaving ? 0 : 1,
        transform: leaving ? "translateY(-24px)" : "none",
        pointerEvents: leaving ? "none" : "auto",
      }}
    >
      <style>{`
        .mju-entry-composer:focus-within { border-color: var(--accent); }
        .mju-entry-send:hover:not(:disabled) { background: var(--accent-hover); }
        .mju-entry-change:hover { color: var(--accent); }
        .mju-entry-item:hover { background: var(--bg-hover); }
      `}</style>

      <div style={{ width: "min(640px, 92vw)", display: "flex", flexDirection: "column" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Mju<span style={{ color: "var(--accent)" }}>—</span>Agents
          </div>
          <div style={{ ...micro, color: "var(--text-dim)", marginTop: 10 }}>
            Local Agent Workbench
          </div>
        </div>

        {projects !== null && projects.length === 0 && (
          <div style={{ marginTop: 36, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
            尚未初始化任何 Mju 项目。请先到
            {" "}
            <Link href="/sessions" style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3 }}>
              Sessions
            </Link>
            {" "}
            页面打开一个项目目录。
          </div>
        )}

        {projects !== null && projects.length > 1 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ ...micro, color: "var(--text-dim)", marginBottom: 6 }}>项目</div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 2 }}>
              {projects.map((p, i) => {
                const active = project?.cwd === p.cwd;
                return (
                  <button
                    key={p.cwd}
                    type="button"
                    onClick={() => setProject(p)}
                    className="mju-entry-item"
                    style={{
                      display: "flex",
                      width: "100%",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 12px",
                      border: "none",
                      borderBottom: i < projects.length - 1 ? "1px solid var(--border)" : "none",
                      background: "transparent",
                      color: active ? "var(--text)" : "var(--text-muted)",
                      font: "inherit",
                      fontSize: 13,
                      fontWeight: active ? 700 : 400,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        flex: "none",
                        background: active ? "var(--accent)" : "transparent",
                      }}
                    />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{p.caseCount} 案件</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {project && (
          <>
            <div
              className="mju-entry-composer"
              style={{
                marginTop: 36,
                border: "1px solid var(--border)",
                borderRadius: 2,
                padding: 16,
                transition: "border-color .15s",
              }}
            >
              <textarea
                autoFocus
                value={text}
                onChange={(e) => onChangeText(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={launching}
                placeholder="描述要做的任务，Mju 会识别归属案件并启动 Agent…"
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  font: "inherit",
                  background: "transparent",
                  color: "var(--text)",
                  minHeight: 44,
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <span style={{ color: "var(--text-muted)", fontSize: 11, letterSpacing: ".06em" }}>
                  {modelLabel ?? ""}
                </span>
                <button
                  type="button"
                  className="mju-entry-send"
                  onClick={() => void launch()}
                  disabled={launching || !text.trim()}
                  aria-label="启动"
                  style={{
                    width: 28,
                    height: 28,
                    border: "none",
                    borderRadius: 2,
                    background: "var(--accent)",
                    color: "#fff",
                    fontSize: 15,
                    cursor: launching || !text.trim() ? "default" : "pointer",
                    opacity: launching || !text.trim() ? 0.4 : 1,
                  }}
                >
                  →
                </button>
              </div>
            </div>

            <div
              ref={menuRef}
              style={{
                position: "relative",
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 10,
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 11,
                opacity: showChip ? 1 : 0,
                transition: "opacity .3s",
                pointerEvents: showChip ? "auto" : "none",
              }}
            >
              <span>识别为</span>
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--text)",
                  borderBottom: "2px solid var(--accent)",
                  paddingBottom: 1,
                }}
              >
                {chipTitle}
              </span>
              <span
                className="mju-entry-change"
                onClick={() => setMenuOpen((v) => !v)}
                style={{
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                更改
              </span>

              {menuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    marginTop: 8,
                    width: 280,
                    maxHeight: 260,
                    overflowY: "auto",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 2,
                    zIndex: 30,
                  }}
                >
                  {[...cases.map((c) => ({ id: c.id, title: c.title, pin: { kind: "case", value: c } as Pinned })),
                    { id: "__inbox__", title: INBOX_TITLE, pin: { kind: "inbox" } as Pinned },
                  ].map((item, i, arr) => (
                    <button
                      key={item.id}
                      type="button"
                      className="mju-entry-item"
                      onClick={() => {
                        setPinned(item.pin);
                        setMenuOpen(false);
                      }}
                      style={{
                        display: "flex",
                        width: "100%",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 12px",
                        border: "none",
                        borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                        background: "transparent",
                        color: "var(--text)",
                        font: "inherit",
                        fontSize: 12,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.title}
                      </span>
                      {chipTitle === item.title && (
                        <span style={{ width: 6, height: 6, flex: "none", background: "var(--accent)" }} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "var(--accent)" }}>
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
