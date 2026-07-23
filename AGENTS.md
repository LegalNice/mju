# Pi Agent Web - Development Notes

## Quick Start

```bash
npm run dev   # port 30142
```

Typecheck: `node_modules/.bin/tsc --noEmit`  
Lint: `npm run lint`  
**Never run `next build` during dev** — pollutes `.next/` and breaks `npm run dev`.

---

## Architecture

```
Browser                Next.js Server              AgentSession (in-process)
  │                        │                               │
  ├─ GET /api/sessions ────▶ reads ~/.pi/agent/sessions/   │
  ├─ GET /api/sessions/[id] reads .jsonl file directly     │
  ├─ GET /api/agent/running/events ───▶ running id SSE     │
  │                        │                               │
  ├─ send message ─────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ session.prompt()
  │                        │                               │
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events    │
  │                        │   session.onEvent() ◀─────────│ session.subscribe()
  │◀── data: {...} ─────────│                               │
```

**Session browsing** (read-only): reads `.jsonl` files through SDK `SessionManager` helpers and `lib/session-reader.ts` — no AgentSession created.  
**Sending a message**: `startRpcSession()` in `lib/rpc-manager.ts` creates an AgentSession in-process.

---

## File Map

```
app/
  page.tsx                      / — entry page (EntryPage)
  board/page.tsx                /board — redirect to last case (BoardIndex)
  board/[caseId]/page.tsx       per-case kanban (CaseBoardView)
  dates/page.tsx                global dates, list/week/month (DatesView)
  task/[taskId]/page.tsx        task detail (TaskDetailView)
  sessions/page.tsx             legacy redirect: ?session=<id> → owning /task, else /
app/api/
  sessions/route.ts               GET  list all sessions
  sessions/[id]/route.ts          GET/PATCH/DELETE session
  sessions/[id]/context/route.ts  GET ?leafId= — context for a specific leaf
  sessions/[id]/export/route.ts   GET exported HTML for a session
  agent/new/route.ts              POST { cwd, message, toolNames?, provider?, modelId? }
  agent/[id]/route.ts             GET state | POST any command
  agent/[id]/events/route.ts      GET SSE stream
  agent/running/events/route.ts   GET SSE stream of currently-running session ids
  auth/all-providers/route.ts     GET API-key provider list
  auth/api-key/[provider]/route.ts GET/POST/DELETE provider API key status/storage
  auth/login/[provider]/route.ts  GET OAuth/device-code SSE | POST manual code
  auth/logout/[provider]/route.ts POST OAuth logout
  auth/providers/route.ts         GET OAuth provider list
  casedocs/route.ts               GET ?cwd=&caseId= — case folder .md files, newest first
  cases/route.ts                  GET/POST cases; POST {action:"ensure_inbox"} creates the inbox case
  cwd/validate/route.ts           POST validate/select a cwd
  default-cwd/route.ts            POST create ~/pi-cwd-YYYYMMDD
  files/[...path]/route.ts        GET file contents for viewer
  home/route.ts                   GET user home directory
  models/route.ts                 GET { models, modelList, defaultModel }
  models-config/route.ts          GET/PUT — read/write ~/.pi/agent/models.json
  models-config/test/route.ts     POST test a configured model/provider
  plugins/route.ts                GET/POST package plugin management
  projects/route.ts               GET list initialized ~/.mju projects (decoded cwd, caseCount)
  projects/init/route.ts          POST init project store (+ Obsidian vault scan)
  skills/route.ts                 GET/PATCH loaded skills and disable-model-invocation
  skills/install/route.ts         POST install skills through npx skills add
  skills/search/route.ts          GET/POST skills.sh search
  tasks/route.ts                  GET/POST/PATCH/DELETE tasks (sessionId/originPrompt supported)
  deadlines/route.ts              GET/POST/PATCH/DELETE deadlines
  schedules/route.ts              GET/POST/PATCH/DELETE schedules
  workflows/route.ts              GET/POST workflow preview/start
  worktrees/route.ts              GET/POST/DELETE git worktrees

lib/
  agent-client.ts      typed fetch helper for /api/agent commands
  draft-store.ts       local draft persistence helpers
  file-access.ts       allowed file roots for /api/files and worktrees
  file-paths.ts        client/server path encoding helpers
  markdown.ts          shared markdown helpers
  npx.ts               npx runner used by skill install
  pi-types.ts          local structural types for pi SDK objects
  rpc-manager.ts      AgentSessionWrapper + registry + startRpcSession
  session-reader.ts   SessionManager wrappers + path cache + buildSessionContext adapter
  tool-presets.ts     PRESET_NONE/DEFAULT/FULL + getPresetFromTools()
  types.ts            shared TypeScript types
  normalize.ts        normalizeToolCalls() — field name mismatch between file format and our types
  worktree.ts         project/worktree resolution and git worktree operations
  mju-paths.ts        ~/.mju/ layout — Mju metadata lives outside the workspace
  mju-orchestration.ts system-prompt guidance for auto subagent delegation
  pi-runtime-paths.ts resolves bundled pi-subagents package paths (cwd-based fallback for Next/Turbopack)
  subagent-config-tool.ts configure_subagent custom tool — writes project agents to ~/.mju

components/
  AppNav.tsx          shared top nav (Board/Dates) for workbench pages
  EntryPage.tsx       / entry composer + case detection chip + launch transition + init-project form
  BoardIndex.tsx      /board redirect (localStorage mju-last-case → first active case)
  CaseBoardView.tsx   per-case kanban (3 columns, running pulse, case switcher)
  DatesView.tsx       global dates with list/week/month switchable views
  TaskDetailView.tsx  task detail: full chat (embedded ChatWindow) | live doc preview
  ChatWindow.tsx      self-contained chat unit (messages + input + minimap + sound)
  ChatInput.tsx       input bar + model/thinking/tools/compact controls
  MessageView.tsx     renders one message (user/assistant/toolCall/toolResult)
  BranchNavigator.tsx in-session branch switcher (inline mode used by TaskDetailView)
  ChatMinimap.tsx     scroll minimap alongside the message list
  MarkdownBody.tsx    markdown renderer
  ModelsConfig.tsx    modal for editing models.json (entry-page config strip)
  PluginsConfig.tsx   modal for installed package plugins
  SkillsConfig.tsx    modal for loaded/search/installable skills
  FileIcons.tsx       file icon helpers

hooks/
  useAgentSession.ts  messages + streaming + SSE + fork/navigate/reconciliation logic
  useAudio.ts         completion sound + browser AudioContext unlock
  useDragDrop.ts      shared drag/drop state
  useIsMobile.ts      responsive breakpoint hook
  useTheme.ts         theme state
```

---

## Key Design Decisions & Traps

### Workbench IA (entry → board → dates → task)
- `/` is a full-bleed entry composer; the old `/sessions` chat workbench (AppShell + SessionSidebar + FileExplorer/FileViewer/TabBar) is **retired and deleted** — `app/sessions/page.tsx` only redirects legacy `?session=<id>` links to the owning task via `findTaskBySessionId()`.
- The task detail page hosts the full chat: `TaskDetailView` mounts `<ChatWindow key={sessionId}>` with a synthesized minimal `SessionInfo` (the hook only reads id/cwd/name). Session load is mount-once — always remount via `key` when sessionId changes (fork included; fork also PATCHes the task's sessionId binding).
- Entry launch binds task ↔ session: `POST /api/agent/new` with `cwd = case.vaultPath` (agent works inside the case folder), then `POST /api/tasks` with `cwd = project root` (store lives there) carrying `sessionId` + `originPrompt`. Two different cwds on purpose.
- Unmatched instructions land in the "通用任务" inbox case (`ensureInboxCase` in `lib/mju-store.ts`, idempotent; folder `ops/inbox` for Obsidian vaults).
- `localStorage` keys: `mju-last-case` ({cwd, caseId} — board/dates project resolution), `mju-entry-cwd` (entry project picker), `mju-dates-view` (list/week/month).

### Chrome 150 selector-matching bug — avoid same-class ancestor selectors
`body.dates .dates { … }` (ancestor and descendant sharing a class name) silently fails to match in Chrome 150 — reproduced in a minimal case and it cost us a "blank page" bug in `sketches/005-ia`. Rename state classes so ancestor/descendant class names never collide (e.g. `body.show-dates .dates`), or use inline styles like the components do.

### Headless screenshots with SSE pages
Pages holding an open `EventSource` (board/task/dates) deadlock Chrome's `--virtual-time-budget` and never produce a screenshot. Use `scripts/cdp-shot.mjs <url> <out> [settleMs] [clickText]` — a dependency-free CDP screenshotter (Node 22 built-in WebSocket) that waits a fixed settle time instead.

### AgentSession lifecycle (`lib/rpc-manager.ts`)
- One `AgentSessionWrapper` per session id, keyed in `globalThis.__piSessions`
- `globalThis` survives Next.js hot-reload; plain module-level Map does not
- Idle timeout: 10 minutes. Concurrent `startRpcSession()` calls share a single start Promise (`globalThis.__piStartLocks`)

### Fork must destroy the wrapper immediately
`AgentSession.fork()` **mutates the wrapper's inner state in-place** — after fork, `inner.sessionId` is the *new* session's id. If the wrapper stays alive in the registry under the old id, the next request gets the already-forked state and subsequent forks produce a corrupt `parentSession` chain.

**Fix**: `send("fork")` captures `newSessionId`, then calls `this.destroy()` before returning. The next request for the original session reloads a clean AgentSession from the original file.

### Two kinds of branching — don't confuse them
- **Fork** (Fork button on user message): creates a new independent `.jsonl` file. Shown as a child in the sidebar tree via `parentSession` header field.
- **In-session branch** (Continue button / BranchNavigator): calls `navigate_tree` within the same file. Multiple entries share the same `parentId`. Switching between them calls `/api/sessions/[id]/context?leafId=`.

### Session files can be fully rewritten
`parentSession` in the header is **display metadata only** — has zero effect on chat content. Safe to `writeFileSync` the entire file (pi does this itself during migrations). Used when cascade-reparenting children on delete.

### ToolCall field normalization
Pi stores toolCall blocks as `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses `{toolCallId, toolName, input}`. `normalizeToolCalls()` in `lib/normalize.ts` handles this — called in both `session-reader.ts` (file load) and `ChatWindow.handleAgentEvent()` (streaming).

### New session tool preset
Tool names are passed at session creation (`POST /api/agent/new` → `toolNames[]`). For existing sessions, the active preset is inferred on mount via `get_tools` → `getPresetFromTools()`. When tools are fully disabled (`toolNames = []`), `rpc-manager.ts` passes an empty tool allow-list and forces `agent.state.systemPrompt = ""` after startup/reload/resource discovery.

### pi-subagents must resolve from the project root
`createRequire(import.meta.url)` fails under Next/Turbopack (the bundled URL points into `.next`), so `getPiSubagentsPaths()` in `lib/pi-runtime-paths.ts` falls back to `process.cwd()`. If the `subagent` tool ever goes missing from `get_tools`, check that resolution first — the main agent cannot delegate without it.

### Mju metadata lives outside the workspace
Project agent configs are stored in `~/.mju/projects/<encoded-cwd>/agents/` (see `lib/mju-paths.ts`), never inside the Obsidian vault. `rpc-manager.ts` registers that dir through `PI_SUBAGENT_EXTRA_AGENT_DIRS` so pi-subagents discovers them as user-scope agents. Legacy `<cwd>/.mju/agents` and `<cwd>/.pi/agents` are still read (lower precedence) and cleaned on DELETE.

### Auto subagent delegation
`lib/mju-orchestration.ts` holds the system-prompt section appended via `resourceLoaderOptions.appendSystemPrompt` (only when pi-subagents resolves). It tells the main agent to `subagent` list-then-delegate on substantial work without the user naming an agent. This is prompt-level routing, not a hard router — if a model still does everything itself, strengthen this text rather than adding code.

### Model defaults for new sessions
`GET /api/models` returns `defaultModel` read from `~/.pi/agent/settings.json`. `ChatWindow` pre-selects this on mount for new sessions.

### SSE reconnect on page refresh mid-stream
On `ChatWindow` mount, `GET /api/agent/[id]` is called. If `state.isStreaming === true`, SSE is reconnected automatically. `thinkingLevel` and `isCompacting` are also synced from this response.

### Compaction SSE events
Newer pi emits `compaction_start` / `compaction_end`; older versions emitted `auto_compaction_start` / `auto_compaction_end`. `handleAgentEvent` accepts both sets to keep `isCompacting` in sync. Manual compact is a blocking POST — the button stays disabled until the response returns.

### Running state SSE + reconciliation
- The sidebar listens to `/api/agent/running/events`, backed by `subscribeRunningSessions()` in `lib/rpc-manager.ts`, so running badges update without polling.
- `useAgentSession` still treats per-session SSE as primary for chat events, but while a run is active it periodically calls `GET /api/agent/[id]` and also reconciles on `visibilitychange`/`online`. This fixes missed `agent_end` events from background tabs or half-open connections.
- Prompt runs use a monotonic run id; late SSE or slow reconciliation responses from an old run must be ignored so they cannot resurrect stale streaming bubbles.

### Worktrees and project grouping
- `lib/worktree.ts` resolves linked worktree top-levels back to the main repo `projectRoot`; `listAllSessions()` attaches that to each `SessionInfo` so all worktrees for one repo are grouped together in the sidebar.
- Worktree operations are served by `/api/worktrees` and guarded by the same allowed-root rules as `/api/files`.
- New worktrees are created under `<repoRoot>-worktrees/<sanitized-branch>`. Existing branches are reused; otherwise `git worktree add -b` creates the branch.
- Removing a dirty worktree returns `409` with `{ dirty: true }` so the UI can ask before retrying with `force`.
- Sessions whose cwd points at a removed worktree are inferred back into the main project instead of becoming a phantom project row.

### File access allow-list
- `/api/files` is intentionally not a general filesystem browser. Allowed roots come from session cwds, their resolved project roots, `~/pi-cwd-*`, and roots explicitly added with `allowFileRoot()`.
- `/api/cwd/validate`, `/api/default-cwd`, and `/api/worktrees` call `allowFileRoot()` when they make a new location browsable.

### Plugins and skills
- `/api/plugins` uses pi's `SettingsManager` + `DefaultPackageManager` for global/project package install, remove, update, enable, and disable. Disabling writes empty `extensions/skills/prompts/themes` arrays for that package entry.
- `/api/skills` uses `DefaultResourceLoader` so settings paths, package skills, and project `.agents/skills` are listed the same way the runtime sees them.
- Skill toggling edits only the `disable-model-invocation` frontmatter key on the target `SKILL.md`; keep that surgical so user formatting survives.
- `/api/skills/install` shells through `npx skills add ... --agent pi`; project installs run with the selected cwd.

### Auth and model config
- `ModelsConfig` combines models from `~/.pi/agent/models.json` with provider auth status from pi's `AuthStorage`/`ModelRegistry`.
- OAuth/device-code/manual-code flows are streamed by `GET /api/auth/login/[provider]`; manual code responses POST back with a short-lived token stored in `globalThis.__piLoginCallbacks`.
- API-key routes store and remove keys through `AuthStorage`. Status endpoints must never return the raw key.
- The model test route is `app/api/models-config/test/route.ts`; `app/api/models/test/` is not a real route.

### Completion sound
- `hooks/useAudio.ts` stores the toggle in `localStorage` as `pi-sound-enabled` and reuses one `AudioContext`.
- Browser autoplay policy means sound must be unlocked from a user gesture; `ChatInput` calls the unlock hook from interactive controls, and `ChatWindow` plays the tone from `onAgentEnd`.

### Exported session HTML
- `/api/sessions/[id]/export` delegates to pi's export helper, then patches recursive tree helpers in the generated HTML to iterative versions so very deep linear sessions do not overflow the browser call stack.

## Pi Session File Format

Location: `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"zenmux","modelId":"claude-sonnet-4-6","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"user-defined name"}
```

`entryIds[]` in `SessionContext` is a parallel array to `messages[]` — maps each displayed message back to its `.jsonl` entry id, used for fork and navigate_tree calls.

---

## CSS Variables (`app/globals.css`)

```
--bg --bg-panel --bg-hover --bg-selected --border
--text --text-muted --text-dim
--accent --user-bg --tool-bg
--font-mono
```
