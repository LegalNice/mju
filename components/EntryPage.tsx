"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Case as MjuCase, Deadline, Schedule, Task } from "@/lib/mju-models";
import { ModelsConfig } from "@/components/ModelsConfig";
import { SkillsConfig } from "@/components/SkillsConfig";
import { SubagentsConfig } from "@/components/SubagentsConfig";
import { PluginsConfig } from "@/components/PluginsConfig";
import { ThemeConfig } from "@/components/ThemeConfig";
import { Wordmark } from "@/components/Wordmark";

const LS_CWD = "mju-entry-cwd";
const LS_LAST_CASE = "mju-last-case";
const LS_MODEL = "mju-entry-model";
const INBOX_TITLE = "通用任务";

type ConfigPanel = "models" | "skills" | "agents" | "plugins" | "theme";

interface ProjectSummary {
  cwd: string;
  name: string;
  caseCount: number;
  isObsidianVault: boolean;
  updatedAt: string;
}

/** One entry of GET /api/models' modelList. */
interface ModelEntry {
  id: string;
  name: string;
  provider: string;
}

interface ModelSelection {
  provider: string;
  modelId: string;
}

/** Settled result of the latest non-stale /api/classify call. */
interface ClassifyResult {
  text: string;
  case: MjuCase | null;
  deadline: string | null;
}

/** One row in the "近期在办" list, merged from tasks, deadlines and schedules. */
interface AgendaItem {
  /** YYYY-MM-DD, used for sorting, display and overdue math */
  date: string;
  /** HH:mm, schedules only */
  time?: string;
  title: string;
  kind: "task" | "deadline" | "schedule";
  caseId: string;
  caseTitle: string;
  taskId?: string;
  overdue: boolean;
}

function localDateString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "2026-07-25" -> "7-25" */
function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}-${Number(date.slice(8, 10))}`;
}

function overdueDays(date: string, today: string): number {
  return Math.round((Date.parse(today) - Date.parse(date)) / 86400000);
}

/**
 * Merge the project's open work into one sorted list: tasks with a deadline
 * (not 完成/取消), deadlines not done, schedules still in the future.
 * Overdue entries sort first, then ascending by date; capped at 5 rows.
 */
function buildAgenda(
  tasks: Task[],
  deadlines: Deadline[],
  schedules: Schedule[],
  caseTitles: Map<string, string>,
): AgendaItem[] {
  const today = localDateString(new Date());
  const now = new Date();
  const titleOf = (caseId: string) => caseTitles.get(caseId) ?? "";
  const items: AgendaItem[] = [];

  for (const t of tasks) {
    if (!t.deadline || t.status === "完成" || t.status === "取消") continue;
    const date = t.deadline.slice(0, 10);
    items.push({
      date, title: t.title, kind: "task",
      caseId: t.caseId, caseTitle: titleOf(t.caseId), taskId: t.id,
      overdue: date < today,
    });
  }
  for (const d of deadlines) {
    if (d.status === "done") continue;
    const date = d.date.slice(0, 10);
    items.push({
      date, title: d.title, kind: "deadline",
      caseId: d.caseId, caseTitle: titleOf(d.caseId),
      overdue: date < today,
    });
  }
  for (const s of schedules) {
    const when = new Date(s.datetime.replace(" ", "T"));
    if (Number.isNaN(when.getTime()) || when < now) continue;
    items.push({
      date: s.datetime.slice(0, 10), time: s.datetime.slice(11, 16) || undefined,
      title: s.title, kind: "schedule",
      caseId: s.caseId, caseTitle: titleOf(s.caseId),
      overdue: false,
    });
  }

  items.sort((a, b) =>
    Number(b.overdue) - Number(a.overdue)
    || a.date.localeCompare(b.date)
    || (a.time ?? "").localeCompare(b.time ?? ""));
  return items.slice(0, 5);
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

/** Swiss-style checkbox row: 14px accent box + label + 10px muted hint. */
function OptionRow({
  checked,
  onToggle,
  label,
  hint,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  hint: string;
}) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 10 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        aria-label={label}
        style={{
          width: 14,
          height: 14,
          flex: "none",
          marginTop: 1,
          border: checked ? "1px solid var(--accent)" : "1px solid var(--border)",
          borderRadius: 2,
          background: checked ? "var(--accent)" : "transparent",
          color: "#fff",
          fontSize: 10,
          lineHeight: "12px",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {checked ? "✓" : ""}
      </button>
      <div onClick={onToggle} style={{ cursor: "pointer" }}>
        <div style={{ fontSize: 12, color: "var(--text)" }}>{label}</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>
      </div>
    </div>
  );
}

/**
 * Inline "initialize a project" form — a directory path input plus a submit
 * button. On success the parent gets a ProjectSummary derived from the store
 * and selects the project; backend errors surface inline in accent.
 */
function InitProjectForm({ onInitialized }: { onInitialized: (p: ProjectSummary) => void }) {
  const [cwd, setCwd] = useState("");
  const [createSkeleton, setCreateSkeleton] = useState(true);
  const [writeGuidance, setWriteGuidance] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const submit = async () => {
    const value = cwd.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/projects/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: value, createSkeleton, writeGuidance }),
      });
      const data = await readJson(res);
      const store = data.store as {
        cwd?: string;
        projectName?: string;
        cases?: unknown[];
        isObsidianVault?: boolean;
        updatedAt?: string;
      };
      const summary: ProjectSummary = {
        cwd: store.cwd ?? value,
        name: store.projectName ?? value.split("/").filter(Boolean).pop() ?? "Mju 项目",
        caseCount: store.cases?.length ?? 0,
        isObsidianVault: Boolean(store.isObsidianVault),
        updatedAt: store.updatedAt ?? new Date().toISOString(),
      };
      const created = Array.isArray(data.createdDirs) && data.createdDirs.length > 0;
      const guided = data.guidanceWritten === true;
      if (created || guided) {
        // Surface what was materialized for a beat before entering the composer.
        setFeedback(created && guided ? "已创建标准结构与指导文件" : created ? "已创建标准结构" : "已写入指导文件");
        setTimeout(() => onInitialized(summary), 1200);
      } else {
        onInitialized(summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <div
          className="mju-entry-init"
          style={{
            flex: 1,
            border: "1px solid var(--border)",
            borderRadius: 2,
            padding: "9px 12px",
            transition: "border-color .15s",
          }}
        >
          <input
            value={cwd}
            onChange={(e) => {
              setCwd(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={busy}
            placeholder="/path/to/your/vault"
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              font: "inherit",
              fontSize: 12,
              background: "transparent",
              color: "var(--text)",
            }}
          />
        </div>
        <button
          type="button"
          className="mju-entry-initbtn"
          onClick={() => void submit()}
          disabled={busy || !cwd.trim()}
          style={{
            ...micro,
            border: "1px solid var(--accent)",
            borderRadius: 2,
            background: "transparent",
            color: "var(--accent)",
            padding: "0 14px",
            whiteSpace: "nowrap",
            cursor: busy || !cwd.trim() ? "default" : "pointer",
            opacity: busy || !cwd.trim() ? 0.4 : 1,
          }}
        >
          {busy ? "…" : "初始化项目"}
        </button>
      </div>
      <OptionRow
        checked={createSkeleton}
        onToggle={() => setCreateSkeleton((v) => !v)}
        label="生成标准结构"
        hint="ops/cases/案卷 等目录，让任务与日程可被识别"
      />
      <OptionRow
        checked={writeGuidance}
        onToggle={() => setWriteGuidance((v) => !v)}
        label="写入 Agent 指导文件"
        hint="AGENTS.md，规定案件结构与任务格式"
      />
      {feedback && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>{feedback}</div>
      )}
      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--accent)" }}>{error}</div>
      )}
    </div>
  );
}

export function EntryPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [cases, setCases] = useState<MjuCase[]>([]);
  const [text, setText] = useState("");
  const [detected, setDetected] = useState<MjuCase | null>(null);
  const [aiDetected, setAiDetected] = useState<MjuCase | null>(null);
  const [aiDeadline, setAiDeadline] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [pinned, setPinned] = useState<Pinned>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [caseQuery, setCaseQuery] = useState("");
  const [modelList, setModelList] = useState<ModelEntry[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [spotOn, setSpotOn] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const [activeConfig, setActiveConfig] = useState<ConfigPanel | null>(null);
  const [launching, setLaunching] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const spotRef = useRef<HTMLDivElement | null>(null);
  const classifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Incremented on every text change / pin / project switch — stale classify responses check it */
  const classifySeq = useRef(0);
  /** Latest local-match result for the current text (mirrors `detected` for timer callbacks) */
  const detectedRef = useRef<MjuCase | null>(null);
  const pinnedRef = useRef<Pinned>(null);
  const casesRef = useRef<MjuCase[]>([]);
  /** Last instruction text sent to /api/classify — avoids re-asking for identical text */
  const lastClassifyText = useRef("");
  /** In-flight classify request, so launch() can await it instead of racing to the inbox */
  const inflightClassify = useRef<{ text: string; promise: Promise<ClassifyResult> } | null>(null);
  /** Settled classify result for the latest non-stale request (drives deadline carry-over) */
  const classifyResultRef = useRef<ClassifyResult | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);

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
    detectedRef.current = null;
    setPinned(null);
    pinnedRef.current = null;
    setAiDetected(null);
    setAiDeadline(null);
    setClassifying(false);
    classifySeq.current++;
    lastClassifyText.current = "";
    classifyResultRef.current = null;
    if (classifyTimer.current) clearTimeout(classifyTimer.current);
    setMenuOpen(false);

    let cancelled = false;
    const enc = encodeURIComponent(project.cwd);
    const list = <T,>(path: string, key: string): Promise<T[]> =>
      fetch(`${path}?cwd=${enc}`)
        .then((res) => (res.ok ? res.json() : { [key]: [] }))
        .then((data) => (data[key] as T[]) ?? []);
    Promise.all([
      list<MjuCase>("/api/cases", "cases"),
      list<Task>("/api/tasks", "tasks"),
      list<Deadline>("/api/deadlines", "deadlines"),
      list<Schedule>("/api/schedules", "schedules"),
    ])
      .then(([caseList, tasks, deadlines, schedules]) => {
        if (cancelled) return;
        setCases(caseList);
        const titles = new Map(caseList.map((c) => [c.id, c.title]));
        setAgenda(buildAgenda(tasks, deadlines, schedules, titles));
      })
      .catch(() => {
        if (cancelled) return;
        setCases([]);
        setAgenda([]);
      });
    fetch(`/api/models?cwd=${encodeURIComponent(project.cwd)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: {
        defaultModel?: ModelSelection | null;
        modelList?: ModelEntry[];
      } | null) => {
        if (cancelled || !data) return;
        const list = data.modelList ?? [];
        setModelList(list);
        let selection = data.defaultModel ?? null;
        // Prefer the persisted pick when that model is still available.
        try {
          const stored = JSON.parse(localStorage.getItem(LS_MODEL) ?? "null") as ModelSelection | null;
          if (stored && list.some((m) => m.provider === stored.provider && m.id === stored.modelId)) {
            selection = stored;
          }
        } catch { /* malformed cache — fall back to the default */ }
        setSelectedModel(selection);
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

  // Close the model dropdown on outside click.
  useEffect(() => {
    if (!modelMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [modelMenuOpen]);

  // Keep a ref mirror of the loaded cases so async classify callbacks read
  // the current list without re-creating timers on every cases change.
  useEffect(() => {
    casesRef.current = cases;
  }, [cases]);

  const scheduleDetect = useCallback(
    (value: string) => {
      if (detectTimer.current) clearTimeout(detectTimer.current);
      detectTimer.current = setTimeout(() => {
        // A manual override suspends auto-detection until the text is cleared.
        if (pinned) return;
        const trimmed = value.trim();
        const result = trimmed ? detectCase(cases, trimmed) : null;
        detectedRef.current = result;
        setDetected(result);
      }, 200);
    },
    [cases, pinned],
  );

  /**
   * AI fallback: fires only when the local substring match found nothing, the
   * instruction is at least 8 chars, and the text has been still for 800ms.
   * Responses are dropped when the text changed (or a pin was set) meanwhile.
   */
  const runClassify = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!project || trimmed.length < 8) return;
      if (detectedRef.current) return; // local match already won
      if (trimmed === lastClassifyText.current) return; // same text — don't re-ask
      lastClassifyText.current = trimmed;
      const seq = ++classifySeq.current;
      setClassifying(true);
      const promise = (async (): Promise<ClassifyResult> => {
        try {
          const res = await fetch("/api/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cwd: project.cwd, instruction: trimmed }),
          });
          if (!res.ok) return { text: trimmed, case: null, deadline: null };
          const data = (await res.json()) as { caseId?: string | null; deadline?: string | null };
          const deadline = typeof data.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.deadline)
            ? data.deadline
            : null;
          const hit = data.caseId
            ? casesRef.current.find((c) => c.id === data.caseId) ?? null
            : null;
          return { text: trimmed, case: hit, deadline };
        } catch {
          return { text: trimmed, case: null, deadline: null };
        }
      })();
      inflightClassify.current = { text: trimmed, promise };
      void promise.then((result) => {
        if (inflightClassify.current?.promise === promise) inflightClassify.current = null;
        if (seq !== classifySeq.current) return; // stale — text changed or pinned meanwhile
        classifyResultRef.current = result;
        setClassifying(false);
        setAiDetected(result.case);
        setAiDeadline(result.case ? result.deadline : null);
      });
    },
    [project],
  );

  const scheduleClassify = useCallback(
    (value: string) => {
      if (classifyTimer.current) clearTimeout(classifyTimer.current);
      classifyTimer.current = setTimeout(() => {
        if (pinnedRef.current) return; // manual override suspends the AI fallback
        runClassify(value);
      }, 800);
    },
    [runClassify],
  );

  const onChangeText = (value: string) => {
    setText(value);
    setError(null);
    // Any text change invalidates an in-flight classify for older text.
    classifySeq.current++;
    setClassifying(false);
    if (classifyTimer.current) clearTimeout(classifyTimer.current);
    if (!value.trim()) {
      // Clearing the text releases the manual override and resumes auto-detection.
      setPinned(null);
      pinnedRef.current = null;
      setDetected(null);
      detectedRef.current = null;
      setAiDetected(null);
      setAiDeadline(null);
      setMenuOpen(false);
      if (detectTimer.current) clearTimeout(detectTimer.current);
      return;
    }
    scheduleDetect(value);
    scheduleClassify(value);
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

  const onProjectInitialized = (p: ProjectSummary) => {
    setProjects((prev) => (prev && prev.some((x) => x.cwd === p.cwd) ? prev : [...(prev ?? []), p]));
    setProject(p); // the project effect persists the cwd to localStorage
  };

  const chipTitle = pinned?.kind === "case" ? pinned.value.title
    : pinned?.kind === "inbox" ? INBOX_TITLE
    : detected ? detected.title
    : aiDetected ? aiDetected.title
    : INBOX_TITLE;
  const showClassifying = !pinned && !detected && !aiDetected && classifying;
  const showChip = Boolean(text.trim());
  /** Case dropdown rows after applying the search box filter (inbox is appended separately) */
  const caseQueryLower = caseQuery.trim().toLowerCase();
  const menuCases = caseQueryLower
    ? cases.filter((c) => c.title.toLowerCase().includes(caseQueryLower))
    : cases;
  const modelDisplay = selectedModel ? `${selectedModel.provider} · ${selectedModel.modelId}` : "";
  /** Deadline to show on the chip — only when the visible hit came from the AI fallback */
  const chipAiDeadline = !pinned && !detected && aiDetected ? aiDeadline : null;
  const todayStr = localDateString(new Date());

  const configButtons: { id: ConfigPanel; label: string; needsProject?: boolean }[] = [
    { id: "models", label: "MODELS" },
    { id: "skills", label: "SKILLS", needsProject: true },
    { id: "agents", label: "AGENTS" },
    { id: "plugins", label: "PLUGINS", needsProject: true },
    { id: "theme", label: "THEME" },
  ];

  const launch = async () => {
    const instruction = text.trim();
    if (!instruction || launching || !project) return;
    setLaunching(true);
    setError(null);
    try {
      let targetCase: MjuCase;
      if (pinned?.kind === "case") targetCase = pinned.value;
      else if (pinned?.kind === "inbox") targetCase = await ensureInbox();
      else if (detected) targetCase = detected;
      else if (aiDetected) targetCase = aiDetected;
      else {
        // A classify for this exact instruction may still be in flight — await
        // it instead of racing the task into the inbox prematurely. (The
        // promise's earlier .then publishes the result to classifyResultRef.)
        const pending = inflightClassify.current;
        if (pending && pending.text === instruction) await pending.promise;
        const settled = classifyResultRef.current;
        targetCase = settled && settled.text === instruction && settled.case
          ? settled.case
          : await ensureInbox();
      }
      // Simple rule: whenever the latest classify ran for this exact
      // instruction and returned a deadline, carry it onto the task.
      const settledClassify = classifyResultRef.current;
      const taskDeadline = settledClassify && settledClassify.text === instruction
        ? settledClassify.deadline ?? undefined
        : undefined;

      const agentRes = await fetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd: targetCase.vaultPath,
          type: "prompt",
          message: instruction,
          ...(selectedModel ? { provider: selectedModel.provider, modelId: selectedModel.modelId } : {}),
        }),
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
          ...(taskDeadline ? { deadline: taskDeadline } : {}),
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
        .mju-entry-dates:hover { color: var(--accent); }
        .mju-entry-agenda:hover .mju-entry-agenda-title { color: var(--accent); }
        .mju-entry-init:focus-within { border-color: var(--accent); }
        .mju-entry-initbtn:hover:not(:disabled) { background: var(--accent); color: #fff; }
        .mju-entry-plus:hover { color: var(--accent); }
        .mju-entry-model:hover { color: var(--accent); }
      `}</style>

      <div style={{ width: "min(640px, 92vw)", display: "flex", flexDirection: "column" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Wordmark fontSize={34} />
          </div>
          <div style={{ ...micro, color: "var(--text-dim)", marginTop: 10 }}>
            Local Agent Workbench
          </div>
        </div>

        {projects !== null && projects.length === 0 && (
          <div style={{ marginTop: 36 }}>
            <div style={{ ...micro, color: "var(--text-dim)", marginBottom: 6 }}>初始化项目</div>
            <div style={{ marginBottom: 10, fontSize: 12, color: "var(--text-muted)" }}>
              输入一个目录路径作为 Mju 项目；Obsidian vault 会自动扫描导入案卷。
            </div>
            <InitProjectForm onInitialized={onProjectInitialized} />
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
              <button
                type="button"
                className="mju-entry-plus"
                onClick={() => setInitOpen((v) => !v)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "9px 12px",
                  border: "none",
                  borderTop: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  font: "inherit",
                  ...micro,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                + 初始化新项目
              </button>
            </div>
            {initOpen && (
              <div style={{ marginTop: 12 }}>
                <InitProjectForm
                  onInitialized={(p) => {
                    setInitOpen(false);
                    onProjectInitialized(p);
                  }}
                />
              </div>
            )}
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
                <div ref={modelMenuRef} style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="mju-entry-model"
                    onClick={() => setModelMenuOpen((v) => !v)}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      font: "inherit",
                      color: "var(--text-muted)",
                      fontSize: 11,
                      letterSpacing: ".06em",
                      cursor: modelList.length > 0 ? "pointer" : "default",
                    }}
                  >
                    {modelDisplay}{modelList.length > 0 ? " ▾" : ""}
                  </button>
                  {modelMenuOpen && modelList.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "100%",
                        left: 0,
                        marginBottom: 8,
                        width: 280,
                        maxHeight: 320,
                        overflowY: "auto",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 2,
                        zIndex: 30,
                      }}
                    >
                      {modelList.map((m, i) => {
                        const active = selectedModel?.provider === m.provider && selectedModel?.modelId === m.id;
                        return (
                          <button
                            key={`${m.provider}/${m.id}`}
                            type="button"
                            className="mju-entry-item"
                            onClick={() => {
                              const next = { provider: m.provider, modelId: m.id };
                              setSelectedModel(next);
                              localStorage.setItem(LS_MODEL, JSON.stringify(next));
                              setModelMenuOpen(false);
                            }}
                            style={{
                              display: "flex",
                              width: "100%",
                              alignItems: "center",
                              gap: 10,
                              padding: "9px 12px",
                              border: "none",
                              borderBottom: i < modelList.length - 1 ? "1px solid var(--border)" : "none",
                              background: "transparent",
                              color: active ? "var(--text)" : "var(--text-muted)",
                              font: "inherit",
                              fontSize: 12,
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
                              {m.name}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{m.provider}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
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
              {showClassifying ? (
                <span style={{ color: "var(--text-dim)" }}>识别中…</span>
              ) : (
                <>
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
                  {chipAiDeadline && (
                    <span style={{ color: "var(--text-dim)" }}>· {shortDate(chipAiDeadline)}</span>
                  )}
                  <span
                    className="mju-entry-change"
                    onClick={() => {
                      setMenuOpen((v) => !v);
                      setCaseQuery("");
                    }}
                    style={{
                      color: "var(--text-dim)",
                      cursor: "pointer",
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                    }}
                  >
                    更改
                  </span>
                </>
              )}

              {menuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    marginTop: 8,
                    width: 280,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 2,
                    zIndex: 30,
                  }}
                >
                  <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
                    <input
                      autoFocus
                      value={caseQuery}
                      onChange={(e) => setCaseQuery(e.target.value)}
                      placeholder="搜索案件…"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        border: "1px solid var(--border)",
                        borderRadius: 2,
                        padding: "6px 8px",
                        font: "inherit",
                        fontSize: 12,
                        background: "transparent",
                        color: "var(--text)",
                        outline: "none",
                      }}
                    />
                  </div>
                  <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {caseQueryLower && menuCases.length === 0 && (
                      <div style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-dim)" }}>
                        无匹配案件
                      </div>
                    )}
                    {[...menuCases.map((c) => ({ id: c.id, title: c.title, pin: { kind: "case", value: c } as Pinned })),
                      { id: "__inbox__", title: INBOX_TITLE, pin: { kind: "inbox" } as Pinned },
                    ].map((item, i, arr) => (
                      <button
                        key={item.id}
                        type="button"
                        className="mju-entry-item"
                        onClick={() => {
                          setPinned(item.pin);
                          pinnedRef.current = item.pin;
                          // Manual override cancels any pending AI fallback.
                          classifySeq.current++;
                          setClassifying(false);
                          if (classifyTimer.current) clearTimeout(classifyTimer.current);
                          setMenuOpen(false);
                          setCaseQuery("");
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
                </div>
              )}
            </div>

            {!activeConfig && (
              <div
                ref={spotRef}
                onMouseMove={(e) => {
                  const el = spotRef.current;
                  if (!el) return;
                  const rect = el.getBoundingClientRect();
                  el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
                  el.style.setProperty("--my", `${e.clientY - rect.top}px`);
                }}
                onMouseEnter={() => setSpotOn(true)}
                onMouseLeave={() => setSpotOn(false)}
                style={{
                  position: "relative",
                  height: 28,
                  marginTop: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 20,
                }}
              >
                {/* 底层：真实按钮，几乎不可见 */}
                {configButtons.map((b) => {
                  const disabled = Boolean(b.needsProject && !project);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setActiveConfig(b.id)}
                      style={{
                        ...micro,
                        fontFamily: "inherit",
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        color: "var(--text-dim)",
                        opacity: disabled ? 0.1 : 0.18,
                        cursor: disabled ? "default" : "pointer",
                      }}
                    >
                      {b.label}
                    </button>
                  );
                })}
                {/* 顶层：镜像文字，通过跟随光标的径向渐变 mask 照亮 */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 20,
                    pointerEvents: "none",
                    opacity: spotOn ? 1 : 0,
                    transition: "opacity .25s",
                    WebkitMaskImage: "radial-gradient(circle 90px at var(--mx, -200px) var(--my, -200px), black 0%, transparent 100%)",
                    maskImage: "radial-gradient(circle 90px at var(--mx, -200px) var(--my, -200px), black 0%, transparent 100%)",
                  }}
                >
                  {configButtons.map((b) => (
                    <span
                      key={b.id}
                      style={{
                        ...micro,
                        color: activeConfig === b.id ? "var(--accent)" : "var(--text)",
                      }}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "var(--accent)" }}>
                {error}
              </div>
            )}

            <div style={{ marginTop: 24, textAlign: "left" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    paddingBottom: 8,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span style={{ ...micro, color: "var(--text-dim)" }}>近期在办</span>
                  <Link
                    href="/dates"
                    className="mju-entry-dates"
                    style={{ ...micro, color: "var(--text-muted)", textDecoration: "none", transition: "color .15s" }}
                  >
                    全部 →
                  </Link>
                </div>
                {agenda.map((item, i) => {
                  const href = item.kind === "task" && item.taskId
                    ? `/task/${item.taskId}?cwd=${encodeURIComponent(project.cwd)}`
                    : `/board/${item.caseId}?cwd=${encodeURIComponent(project.cwd)}`;
                  return (
                    <Link
                      key={`${item.kind}-${i}`}
                      href={href}
                      className="mju-entry-agenda"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "64px 1fr auto",
                        gap: 14,
                        padding: "9px 0",
                        borderBottom: "1px solid var(--border)",
                        alignItems: "baseline",
                        textDecoration: "none",
                        color: "var(--text)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-dim)",
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.overdue
                          ? (
                            <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                              逾期 {overdueDays(item.date, todayStr)} 天
                            </span>
                          )
                          : (
                            <>
                              {shortDate(item.date)}
                              {item.time && <span style={{ display: "block", marginTop: 2 }}>{item.time}</span>}
                            </>
                          )}
                      </span>
                      <span
                        className="mju-entry-agenda-title"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          transition: "color .12s",
                        }}
                      >
                        {item.title}
                      </span>
                      <span
                        style={{
                          ...micro,
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 140,
                        }}
                      >
                        {item.caseTitle}
                      </span>
                    </Link>
                  );
                })}
                {agenda.length === 0 && (
                  <div style={{ padding: "12px 0", fontSize: 12, color: "var(--text-dim)" }}>
                    暂无在办事项
                  </div>
                )}
              </div>
          </>
        )}
      </div>

      {activeConfig === "models" && <ModelsConfig onClose={() => setActiveConfig(null)} />}
      {activeConfig === "skills" && project && (
        <SkillsConfig cwd={project.cwd} onClose={() => setActiveConfig(null)} />
      )}
      {activeConfig === "agents" && (
        <SubagentsConfig cwd={project?.cwd ?? null} onClose={() => setActiveConfig(null)} />
      )}
      {activeConfig === "plugins" && project && (
        <PluginsConfig cwd={project.cwd} sessionId={null} onClose={() => setActiveConfig(null)} />
      )}
      {activeConfig === "theme" && <ThemeConfig onClose={() => setActiveConfig(null)} />}
    </div>
  );
}
