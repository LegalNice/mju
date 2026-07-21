# μ Mju Agents

[中文文档](./README.zh-CN.md)

Local-first web workspace for the [pi coding agent](https://github.com/badlogic/pi-mono). Mju Agents reads local pi session files and provides session browsing, real-time chat, model configuration, skill/MCP management, project file preview, and configurable subagents.

It is designed to keep session files and credentials on the user's machine. It is not a legal advice service and does not replace professional review.

Mju Agents bundles the Pi runtime and `pi-subagents`; users do not need to install a separate `pi` CLI. Node.js is required.

![Mju Agents workspace](./docs/screenshot2.png)

One local workspace for structured tool calls, readable Markdown, session browsing, model management, and subagents.

## Quick Start

**Run without installing:**

```bash
npx mju@latest
```

**Or install globally:**

```bash
npm install -g mju
mju
```

Then open [http://localhost:30142](http://localhost:30142). The command will try to open the browser automatically after the server is ready.

**Options:**

```bash
mju --port 8080              # custom port
mju --hostname 127.0.0.1     # local access only
mju -p 8080 -H 127.0.0.1     # combine options
mju --no-open                # do not open the browser automatically

PORT=8080 mju                   # environment variable is also supported
MJU_NO_OPEN=1 mju               # useful when running as a background service
```

## Features

- **Pick work back up**: browse previous pi conversations by project without digging through terminal history or session paths.
- **Try different directions safely**: continue from an earlier message or fork a session into a separate route.
- **Work across branches**: switch Git worktrees from the sidebar so new sessions and the Explorer follow the checkout you choose.
- **Chat beside the project**: browse files on the left and preview source, docs, images, audio, and PDFs on the right while the agent works.
- **See session state clearly**: context usage, cost, compaction state, and system prompt details are visible from the top bar.
- **Configure less from the terminal**: manage models, login/API keys, model tests, and skill switches from the web UI.
- **Coordinate subagents**: choose an agent's model, thinking level, tools, skills, MCP servers, and system prompt, then assign work from the task board.
- **Keep model lists useful**: add multiple accounts for one provider, remove stale providers, and choose which models appear in chat.

## Notes

- **Data directory**: Mju reads `~/.pi/agent/sessions` by default. Set `PI_CODING_AGENT_DIR` to point at another pi agent directory.
- **Session files**: files are stored as `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`.
- **Model config**: the Models panel reads and writes `models.json` in the pi agent directory. Model lists and defaults come from pi's config.
- **File access**: file browsing and preview are scoped to the selected project directory and working directories that appear in sessions.
- **Git worktrees**: see [Worktrees in Mju](./docs/worktrees.md) for when the switcher appears, how new worktrees are created, and what removal does.
- **Forks vs in-session branches**: Fork creates a new `.jsonl` file. "Edit from here" creates another branch inside the same session file.
- **Subagents**: see [Subagents and task board](./docs/subagents.md).
- **Open-source privacy boundary**: see [Open-source release and privacy](./docs/open-source-release.md).

## Development

```bash
npm install
npm run dev
```

The local dev server runs at [http://localhost:30142](http://localhost:30142).

Common checks:

```bash
node_modules/.bin/tsc --noEmit
npm run lint
```

Avoid running `next build` / `npm run build` during local development. It writes to `.next/` and can interfere with the dev server; leave builds for release work.

## Project Structure

```text
app/
  api/
    agent/          # creates/drives AgentSession and exposes SSE events
    auth/           # OAuth and API key management
    cwd/validate/   # custom working directory validation
    default-cwd/    # pi default working directory lookup
    files/          # file listing, reading, preview, and watching
    home/           # current user home directory
    models/         # available models, default model, thinking levels
    models-config/  # read/write models.json and test models
    sessions/       # session reads, rename, delete, context, HTML export
    skills/         # skill listing, search, install, enable/disable
components/
  AppShell.tsx        # main layout, URL state, top panels, file tabs
  SessionSidebar.tsx  # project selector, session tree, Explorer
  ChatWindow.tsx      # messages, SSE, image drag/drop, minimap
  ChatInput.tsx       # input bar, model/tools/thinking/compact/slash controls
  MessageView.tsx     # message, thinking, tool call/result rendering
  ModelsConfig.tsx    # model and auth configuration panel
  SkillsConfig.tsx    # skill management panel
  FileExplorer.tsx    # file tree
  FileViewer.tsx      # source, diff, image, audio, PDF, DOCX preview
lib/
  rpc-manager.ts      # AgentSessionWrapper lifecycle and global registry
  session-reader.ts   # parses .jsonl session files and branch contexts
  normalize.ts        # normalizes toolCall field names
  file-access.ts      # file read safety boundary
  file-paths.ts       # path encoding and relative path helpers
  markdown.ts         # Markdown/Mermaid/KaTeX plugin configuration
  pi-types.ts         # pi-related types
hooks/
  useAgentSession.ts  # session loading, command sending, SSE state machine
  useAudio.ts         # completion sound
  useDragDrop.ts      # image drag/drop
  useTheme.ts         # theme switching
bin/
  mju.js              # npm CLI entrypoint
```
