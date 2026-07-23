# μ Mju Agents

[中文文档](./README.zh-CN.md)

Local-first agent workbench for legal professionals. Mju turns a folder of cases — ideally an Obsidian vault — into a set of case boards, and turns every instruction you type into a task with a full AI agent session behind it.

It is not a legal advice service and does not replace professional review. All session files, case metadata, and credentials stay on your machine.

![Mju Agents entry page](./docs/screenshot-entry.png)

## How it works

Four pages, one flow:

- **Entry (`/`)** — a single composer. Type an instruction; Mju detects which case it belongs to (the chip is always correctable), launches an agent session inside that case's folder, and flies you to the case board. Below the composer, an always-on agenda shows what's due across all cases.
- **Case Board (`/board/[caseId]`)** — one kanban per case (todo / in-progress / done), with a live pulse on tasks whose agent is running. Each case maps to a folder in your vault.
- **Task (`/task/[taskId]`)** — the full chat with the agent on the left (streaming, tool calls, branches, export), and a live preview of the markdown documents it is writing on the right.
- **Dates (`/dates`)** — every task deadline, court deadline, and schedule across all cases, in list, week, or month view. Click any item to jump into its case.

Ad-hoc questions that match no case go to the **通用任务 (inbox)** board, so nothing is lost and every conversation stays a trackable task.

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

Then open [http://localhost:30142](http://localhost:30142). On first run, point Mju at your Obsidian vault (or any folder) from the entry page — vaults are scanned for case folders automatically.

**Options:**

```bash
mju --port 8080              # custom port
mju --hostname 127.0.0.1     # local access only
mju --no-open                # do not open the browser automatically
```

## Features

- **Case-first, not chat-first**: every agent run is bound to a task on a case board; the task keeps the original instruction and the session id.
- **Full agent chat where it belongs**: streaming, tool-call details, in-session branches, forks (auto-rebound to the task), and HTML export live on the task page.
- **Obsidian as the file layer**: cases are vault folders (`ops/cases/案卷`, `ops/projects/活跃项目` are scanned on init); deliverables are written back as plain markdown you keep.
- **Agent teams**: configurable subagents (Justice / Magician / Chariot by default) with per-agent model, tools, and skills; the runtime delegates automatically on substantial work.
- **Deadlines that aggregate**: tasks, filing deadlines, and hearings merge into one global dates view with overdue highlighting.
- **Swiss design**: paper/night themes, one signal-red accent, no clutter — including a spotlight config strip on the entry page (models, skills, agents, plugins, theme).
- **Local-first**: sessions in `~/.pi/agent/sessions`, project metadata in `~/.mju/projects`, nothing leaves the machine. The pi runtime and `pi-subagents` are bundled — no separate CLI install needed.

## Notes

- **Data directories**: sessions `~/.pi/agent/sessions/<encoded-cwd>/*.jsonl`; Mju metadata `~/.mju/projects/<encoded-cwd>/store.json`. Set `PI_CODING_AGENT_DIR` / `MJU_HOME` to relocate.
- **Legacy links**: old `/sessions?session=<id>` URLs redirect to the owning task when one exists.
- **Subagents**: see [Subagents](./docs/subagents.md). **Privacy boundary**: see [Open-source release and privacy](./docs/open-source-release.md).

## Roadmap & Architecture

- **Roadmap**: [docs/roadmap.md](./docs/roadmap.md) — next up: task reassignment, AI-based case classification, workflow launcher.
- **Architecture**: [docs/architecture.md](./docs/architecture.md).

## Development

```bash
npm install
npm run dev    # http://localhost:30142
```

Checks: `node_modules/.bin/tsc --noEmit`, `npm run lint`, `npm run test:backend`. Never run `next build` during dev. See [AGENTS.md](./AGENTS.md) for the full file map and design decisions.
