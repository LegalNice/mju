"use client";

import { useCallback, useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { colors, radius, animationCss, modalBackdrop, modalPanel, buttonPrimary, inputBase, inputFocus, inputBlur } from "@/lib/design-system";

type AgentScope = "user" | "project";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
type Agent = { name: string; description: string; model?: string; thinkingLevel?: ThinkingLevel; tools?: string[]; skills?: string[]; mcp?: string[]; fallbackModels?: string[]; systemPromptMode?: "replace" | "append"; inheritProjectContext?: boolean; inheritSkills?: boolean; async?: boolean; timeoutMs?: number; systemPrompt: string; scope: AgentScope; filePath: string };
type Model = { id: string; name: string; provider: string };
type Skill = { name: string; description: string; filePath: string };

const TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const emptyForm = { name: "", description: "", model: "", thinkingLevel: "off" as ThinkingLevel, tools: [] as string[], skills: [] as string[], mcp: [] as string[], fallbackModels: [] as string[], systemPromptMode: "replace" as "replace" | "append", inheritProjectContext: false, inheritSkills: false, async: false, timeoutMs: 900000, systemPrompt: "", scope: "user" as AgentScope };
const THINKING_LABELS: Record<ThinkingLevel, string> = { off: "关闭", minimal: "极简", low: "低", medium: "中", high: "高", xhigh: "极高", max: "最大" };

function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3z" />
      <path d="M19 16l.6 1.9L21.5 19l-1.9.6L19 21.5l-.6-1.9-1.9-.6 1.9-.6L19 16z" />
    </svg>
  );
}

function ChoiceSection({ title, description, items, selected, onToggle, empty }: { title: string; description: string; items: { id: string; label: string; detail?: string }[]; selected: string[]; onToggle: (id: string) => void; empty: string }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = items.filter((item) => !normalizedQuery || `${item.label} ${item.id} ${item.detail ?? ""}`.toLowerCase().includes(normalizedQuery));
  return (
    <section style={{ marginTop: 16, padding: 16, border: `1px solid ${colors.borderLight}`, borderRadius: radius.lg, background: colors.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{title}</div>
          <div style={{ color: colors.textSecondary, fontSize: 11, marginTop: 3 }}>{description}</div>
        </div>
        <span style={{ color: colors.textTertiary, fontSize: 11, background: colors.bgSecondary, padding: "2px 8px", borderRadius: radius.full }}>{selected.length}/{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ color: colors.textTertiary, fontSize: 12, padding: "8px 0" }}>{empty}</div>
      ) : (
        <>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`搜索${title}…`}
            style={{
              width: "100%", boxSizing: "border-box", padding: "9px 12px", marginBottom: 10,
              borderRadius: radius.md, border: `1px solid ${colors.border}`,
              background: colors.card, color: colors.text, fontSize: 12, outline: "none",
              transition: "border-color .2s ease",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = colors.accent; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = colors.border; }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            {visibleItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => onToggle(item.id)}
                style={{
                  minWidth: 0, padding: "9px 11px", borderRadius: radius.md,
                  border: `1px solid ${selected.includes(item.id) ? colors.accent : colors.border}`,
                  background: selected.includes(item.id) ? colors.accentSoft : colors.card,
                  color: selected.includes(item.id) ? colors.accent : colors.textSecondary,
                  cursor: "pointer", textAlign: "left",
                  transition: "all .2s ease",
                  animation: `mju-slide-up .25s cubic-bezier(.16,1,.3,1) ${index * 0.02}s both`,
                }}
              >
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 500 }}>
                  {selected.includes(item.id) ? "✓ " : ""}{item.label}
                </span>
                {item.detail && (
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10, color: colors.textTertiary, marginTop: 3 }}>
                    {item.detail}
                  </span>
                )}
              </button>
            ))}
            {visibleItems.length === 0 && (
              <div style={{ gridColumn: "1 / -1", color: colors.textTertiary, fontSize: 12, padding: "6px 0" }}>没有匹配的项目</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function SubagentsConfig({ cwd, onClose }: { cwd?: string | null; onClose: () => void }) {
  const isMobile = useIsMobile();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [thinkingLevels, setThinkingLevels] = useState<Record<string, ThinkingLevel[]>>({});
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcp, setMcp] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
      const optionsQuery = cwd ? `?cwd=${encodeURIComponent(cwd)}&options=1` : "";
      const [a, m, o] = await Promise.all([
        fetch(`/api/agents${query}`),
        fetch(`/api/models${query}`),
        cwd ? fetch(`/api/agents${optionsQuery}`) : Promise.resolve(null),
      ]);
      const ad = await a.json() as { agents?: Agent[]; error?: string };
      const md = await m.json() as { modelList?: Model[]; thinkingLevels?: Record<string, ThinkingLevel[]> };
      if (!a.ok || ad.error) throw new Error(ad.error || "Unable to load agents");
      setAgents(ad.agents ?? []);
      setModels(md.modelList ?? []);
      setThinkingLevels(md.thinkingLevels ?? {});
      if (o) {
        const options = await o.json() as { skills?: Skill[]; mcp?: string[] };
        setSkills(options.skills ?? []);
        setMcp(options.mcp ?? []);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => { void load(); }, [load]);

  const editAgent = (agent: Agent) => {
    setSelected(agent.filePath);
    setForm({ name: agent.name, description: agent.description, model: agent.model ?? "", thinkingLevel: agent.thinkingLevel ?? "off", tools: agent.tools ?? [], skills: agent.skills ?? [], mcp: agent.mcp ?? [], fallbackModels: agent.fallbackModels ?? [], systemPromptMode: agent.systemPromptMode ?? "replace", inheritProjectContext: agent.inheritProjectContext ?? false, inheritSkills: agent.inheritSkills ?? false, async: agent.async ?? false, timeoutMs: agent.timeoutMs ?? 900000, systemPrompt: agent.systemPrompt, scope: agent.scope });
    setMessage(null);
  };

  const newAgent = () => {
    setSelected(null);
    setForm({ ...emptyForm, scope: cwd ? "project" : "user" });
    setMessage(null);
  };

  const update = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  const toggleTool = (tool: string) => setForm((current) => ({ ...current, tools: current.tools.includes(tool) ? current.tools.filter((item) => item !== tool) : [...current.tools, tool] }));
  const toggleChoice = (key: "skills" | "mcp", value: string) => setForm((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/agents", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, cwd }) });
      const data = await response.json() as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || "Save failed");
      await load();
      setMessage("已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form.name || !window.confirm(`Delete agent "${form.name}"?`)) return;
    const response = await fetch("/api/agents", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, scope: form.scope, cwd }) });
    if (!response.ok) { setMessage("删除失败"); return; }
    newAgent();
    await load();
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 12, color: colors.textSecondary, fontWeight: 600,
  };

  const selectStyle: React.CSSProperties = {
    ...inputBase(),
    appearance: "none",
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235c5c5c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
  };

  return (
    <>
      <style>{animationCss}</style>
      <div style={modalBackdrop()} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div style={modalPanel(isMobile ? "100%" : 1080, isMobile ? "100%" : 720)}>
          <header
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "24px 28px", borderBottom: `1px solid ${colors.borderLight}`,
              background: colors.card,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 40, height: 40, display: "grid", placeItems: "center", borderRadius: radius.md, background: colors.accentSoft, color: colors.accent }}>
                <SparkIcon />
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: colors.text }}>Subagents</h2>
                <div style={{ marginTop: 4, fontSize: 14, color: colors.textSecondary }}>把重复工作交给合适的协作者</div>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="关闭"
              style={{
                width: 36, height: 36, border: "none", borderRadius: radius.md,
                background: colors.bgSecondary, color: colors.textSecondary,
                fontSize: 22, lineHeight: 1, cursor: "pointer",
                display: "grid", placeItems: "center",
                transition: "background .2s ease, transform .2s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.border; e.currentTarget.style.transform = "scale(1.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.bgSecondary; e.currentTarget.style.transform = "scale(1)"; }}
            >
              ×
            </button>
          </header>

          <div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: isMobile ? "column" : "row" }}>
            <aside
              style={{
                width: isMobile ? "100%" : 300, flexShrink: 0, padding: 24,
                borderRight: isMobile ? "none" : `1px solid ${colors.borderLight}`,
                borderBottom: isMobile ? `1px solid ${colors.borderLight}` : "none",
                overflow: "auto",
                background: colors.bgTertiary,
              }}
            >
              <div style={{ fontSize: 12, color: colors.textTertiary, fontWeight: 600, letterSpacing: ".06em", marginBottom: 14, textTransform: "uppercase" }}>
                Agent 库
              </div>
              <button
                onClick={newAgent}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", marginBottom: 14,
                  borderRadius: radius.md, border: `1px solid ${colors.accent}`,
                  background: colors.accentSoft, color: colors.accent,
                  fontWeight: 600, cursor: "pointer", textAlign: "left",
                  transition: "all .2s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,93,58,.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = colors.accentSoft; }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
                新建 Subagent
              </button>

              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} style={{ height: 64, borderRadius: radius.md, background: colors.bgSecondary, animation: "mju-pulse-subtle 1.5s ease-in-out infinite" }} />
                  ))}
                </div>
              ) : agents.length === 0 ? (
                <div style={{ padding: "24px 8px", color: colors.textTertiary, fontSize: 13, lineHeight: 1.7, textAlign: "center" }}>
                  还没有协作者。<br />创建一个角色，让它拥有清晰的职责和边界。
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {agents.map((agent, index) => (
                    <button
                      key={agent.filePath}
                      onClick={() => editAgent(agent)}
                      style={{
                        display: "flex", gap: 10, textAlign: "left", padding: 12,
                        borderRadius: radius.md, border: `1px solid ${selected === agent.filePath ? colors.accent : colors.borderLight}`,
                        background: selected === agent.filePath ? colors.accentSoft : colors.card,
                        color: colors.text, cursor: "pointer",
                        transition: "all .2s ease",
                        animation: `mju-slide-up .25s cubic-bezier(.16,1,.3,1) ${index * 0.04}s both`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateX(3px)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateX(0)"; }}
                    >
                      <span style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: radius.md, background: colors.accentSoft, color: colors.accent, flexShrink: 0 }}>
                        <SparkIcon />
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{agent.name}</span>
                        <span style={{ display: "block", color: colors.textSecondary, fontSize: 11, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.description}</span>
                        <span style={{ display: "block", color: colors.textTertiary, fontSize: 10, marginTop: 5 }}>
                          {agent.scope === "project" ? "项目" : "全局"} · {agent.model || "默认模型"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <main style={{ flex: 1, minWidth: 0, padding: 24, overflow: "auto", background: colors.bg }}>
              <div style={{ position: "sticky", top: -24, zIndex: 5, display: "flex", justifyContent: "flex-end", gap: 10, margin: "-24px -24px 20px", padding: "12px 24px", borderBottom: `1px solid ${colors.borderLight}`, background: "rgba(253,252,251,.92)", backdropFilter: "blur(12px)" }}>
                <button
                  onClick={() => void save()}
                  disabled={saving || !form.name || !form.description}
                  style={buttonPrimary(saving || !form.name || !form.description)}
                  onMouseEnter={(e) => { if (!saving && form.name && form.description) { e.currentTarget.style.background = colors.accentHover; } }}
                  onMouseLeave={(e) => { if (!saving && form.name && form.description) { e.currentTarget.style.background = colors.accent; } }}
                >
                  {saving ? "保存中…" : "保存配置"}
                </button>
                {selected && (
                  <button
                    onClick={() => void remove()}
                    style={{
                      padding: "10px 14px", border: `1px solid ${colors.error}`, borderRadius: radius.md,
                      background: "transparent", color: colors.error, cursor: "pointer", fontSize: 13,
                      transition: "all .2s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = colors.errorSoft; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    删除
                  </button>
                )}
                {message && (
                  <span style={{ alignSelf: "center", fontSize: 12, color: message === "已保存" ? colors.accent : colors.error }}>
                    {message}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
                <div>
                  <div style={{ color: colors.accent, fontSize: 11, fontWeight: 600, letterSpacing: ".08em", marginBottom: 6 }}>
                    {selected ? "EDIT AGENT" : "NEW AGENT"}
                  </div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: colors.text }}>
                    {selected ? `编辑 ${form.name}` : "创建一个专属协作者"}
                  </h2>
                  <p style={{ margin: "8px 0 0", color: colors.textSecondary, fontSize: 13 }}>
                    先定义它做什么，再决定它能看到什么。
                  </p>
                </div>
                <div style={{ padding: "6px 10px", borderRadius: radius.full, background: colors.bgSecondary, color: colors.textSecondary, fontSize: 11, whiteSpace: "nowrap" }}>
                  Markdown agent
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                <label style={labelStyle}>
                  名称
                  <input
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="researcher"
                    style={{ ...inputBase(), marginTop: 6 }}
                    onFocus={inputFocus}
                    onBlur={inputBlur}
                  />
                </label>
                <label style={labelStyle}>
                  一句话职责
                  <input
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="负责资料检索和事实核查"
                    style={{ ...inputBase(), marginTop: 6 }}
                    onFocus={inputFocus}
                    onBlur={inputBlur}
                  />
                </label>
                <div>
                  <label style={labelStyle}>
                    模型
                    <select
                      value={form.model}
                      onChange={(e) => update("model", e.target.value)}
                      style={{ ...selectStyle, marginTop: 6 }}
                    >
                      <option value="">使用默认模型</option>
                      {models.map((model) => (
                        <option key={`${model.provider}/${model.id}`} value={`${model.provider}/${model.id}`}>
                          {model.name || model.id} ({model.provider})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ ...labelStyle, marginTop: 14 }}>
                    思考强度
                    <select
                      value={form.thinkingLevel}
                      onChange={(e) => update("thinkingLevel", e.target.value)}
                      style={{ ...selectStyle, marginTop: 6 }}
                    >
                      <option value="off">关闭</option>
                      {(thinkingLevels[form.model.replace("/", ":")] ?? ["minimal", "low", "medium", "high", "xhigh", "max"] as ThinkingLevel[]).filter((level) => level !== "off").map((level) => (
                        <option key={level} value={level}>{THINKING_LABELS[level]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, fontWeight: 600, marginBottom: 8 }}>作用域</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["user", "project"] as AgentScope[]).map((scope) => (
                      <button
                        key={scope}
                        onClick={() => scope === "project" && cwd && update("scope", scope)}
                        disabled={scope === "project" && !cwd}
                        style={{
                          flex: 1, padding: "10px 12px", borderRadius: radius.md,
                          border: `1px solid ${form.scope === scope ? colors.accent : colors.border}`,
                          background: form.scope === scope ? colors.accentSoft : colors.card,
                          color: form.scope === scope ? colors.accent : colors.textSecondary,
                          cursor: scope === "project" && !cwd ? "not-allowed" : "pointer",
                          fontSize: 13, fontWeight: form.scope === scope ? 600 : 500,
                          opacity: scope === "project" && !cwd ? .5 : 1,
                          transition: "all .2s ease",
                        }}
                      >
                        {scope === "user" ? "全局" : "项目"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <section style={{ marginTop: 20, padding: 16, border: `1px solid ${colors.borderLight}`, borderRadius: radius.lg, background: colors.card }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>运行方式与上下文</div>
                <div style={{ color: colors.textSecondary, fontSize: 11, marginTop: 3, marginBottom: 12 }}>
                  这些设置直接对应 pi-subagents 的 Agent 配置。
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                  <label style={labelStyle}>
                    备用模型（每行一个）
                    <textarea
                      value={form.fallbackModels.join("\n")}
                      onChange={(e) => update("fallbackModels", e.target.value.split(/\n|,/).map((value) => value.trim()).filter(Boolean))}
                      placeholder="openai/gpt-5-mini"
                      rows={3}
                      style={{ ...inputBase(), marginTop: 6, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12 }}
                      onFocus={inputFocus}
                      onBlur={inputBlur}
                    />
                  </label>
                  <div>
                    <label style={labelStyle}>
                      超时时间（毫秒）
                      <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={form.timeoutMs}
                        onChange={(e) => update("timeoutMs", Number(e.target.value) || 900000)}
                        style={{ ...inputBase(), marginTop: 6 }}
                        onFocus={inputFocus}
                        onBlur={inputBlur}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, color: colors.textSecondary, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={form.async}
                        onChange={(e) => update("async", e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: colors.accent }}
                      />
                      默认后台运行
                    </label>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                  {[
                    { key: "inheritProjectContext", label: "继承项目上下文" },
                    { key: "inheritSkills", label: "继承技能目录" },
                  ].map((item) => (
                    <label
                      key={item.key}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                        border: `1px solid ${colors.border}`, borderRadius: radius.md,
                        fontSize: 12, color: colors.textSecondary, cursor: "pointer",
                        transition: "all .2s ease",
                        background: form[item.key as "inheritProjectContext" | "inheritSkills"] ? colors.accentSoft : colors.card,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={form[item.key as "inheritProjectContext" | "inheritSkills"]}
                        onChange={(e) => update(item.key, e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: colors.accent }}
                      />
                      {item.label}
                    </label>
                  ))}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.md, fontSize: 12, color: colors.textSecondary }}>
                    System Prompt
                    <select
                      value={form.systemPromptMode}
                      onChange={(e) => update("systemPromptMode", e.target.value)}
                      style={{ border: "none", background: "transparent", color: colors.text, fontSize: 12, outline: "none" }}
                    >
                      <option value="replace">替换</option>
                      <option value="append">追加</option>
                    </select>
                  </label>
                </div>
              </section>

              <section style={{ marginTop: 20, padding: 16, border: `1px solid ${colors.borderLight}`, borderRadius: radius.lg, background: colors.card }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>工具权限</div>
                    <div style={{ color: colors.textSecondary, fontSize: 11, marginTop: 3 }}>只开放完成职责所需的能力</div>
                  </div>
                  <span style={{ color: colors.textTertiary, fontSize: 11, background: colors.bgSecondary, padding: "2px 8px", borderRadius: radius.full }}>
                    {form.tools.length}/{TOOLS.length} enabled
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {TOOLS.map((tool, index) => (
                    <button
                      key={tool}
                      onClick={() => toggleTool(tool)}
                      style={{
                        padding: "8px 12px", borderRadius: radius.md,
                        border: `1px solid ${form.tools.includes(tool) ? colors.accent : colors.border}`,
                        background: form.tools.includes(tool) ? colors.accentSoft : colors.card,
                        color: form.tools.includes(tool) ? colors.accent : colors.textSecondary,
                        fontSize: 12, fontWeight: form.tools.includes(tool) ? 600 : 500,
                        cursor: "pointer",
                        transition: "all .2s ease",
                        animation: `mju-slide-up .2s cubic-bezier(.16,1,.3,1) ${index * 0.03}s both`,
                      }}
                    >
                      {form.tools.includes(tool) ? "✓ " : ""}{tool}
                    </button>
                  ))}
                </div>
              </section>

              <ChoiceSection
                title="可用技能"
                description="只让该 Subagent 调用选中的技能"
                items={skills.map((skill) => ({ id: skill.name, label: skill.name, detail: skill.description }))}
                selected={form.skills}
                onToggle={(id) => toggleChoice("skills", id)}
                empty="当前项目暂无可用技能"
              />
              <ChoiceSection
                title="MCP 工具"
                description="控制该 Subagent 可以使用的 MCP Server"
                items={mcp.map((server) => ({ id: server, label: server }))}
                selected={form.mcp}
                onToggle={(id) => toggleChoice("mcp", id)}
                empty="当前未发现 MCP Server"
              />

              <label style={{ display: "block", marginTop: 24, fontSize: 12, color: colors.textSecondary, fontWeight: 600 }}>
                System Prompt
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => update("systemPrompt", e.target.value)}
                  placeholder={"你是一名专业的研究员……\n\n工作方式：\n- 先列出事实和来源\n- 明确标记待核验内容"}
                  rows={isMobile ? 8 : 10}
                  style={{
                    ...inputBase(), marginTop: 8, resize: "vertical",
                    fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12, lineHeight: 1.7,
                  }}
                  onFocus={inputFocus}
                  onBlur={inputBlur}
                />
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${colors.borderLight}` }}>
                <button
                  onClick={() => void save()}
                  disabled={saving || !form.name || !form.description}
                  style={buttonPrimary(saving || !form.name || !form.description)}
                  onMouseEnter={(e) => { if (!saving && form.name && form.description) { e.currentTarget.style.background = colors.accentHover; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                  onMouseLeave={(e) => { if (!saving && form.name && form.description) { e.currentTarget.style.background = colors.accent; e.currentTarget.style.transform = "translateY(0)"; } }}
                >
                  {saving ? "保存中…" : "保存配置"}
                </button>
                {selected && (
                  <button
                    onClick={() => void remove()}
                    style={{
                      padding: "11px 16px", border: `1px solid ${colors.error}`, borderRadius: radius.md,
                      background: "transparent", color: colors.error, cursor: "pointer", fontSize: 13,
                      transition: "all .2s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = colors.errorSoft; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    删除
                  </button>
                )}
                {message && (
                  <span style={{ fontSize: 12, color: message === "已保存" ? colors.accent : colors.error }}>
                    {message}
                  </span>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
