# μ Mju Agents

[中文文档](./README.zh-CN.md)

A local-first agent workbench for legal professionals: conversation is the entry point, and the case is where everything lands.

![Mju Agents entry page](./docs/screenshot-entry.png)

## Why Mju

Legal professionals shouldn't have to configure technology to get work done. Work should start where it actually starts — and legal work almost always starts with one sentence: "look into this case", "the defense statement is due Wednesday", "set up a meeting with the client".

So Mju has a single thread: **you say one sentence, and it turns that sentence into real work inside a case.**

A few principles run through everything:

- **Every conversation has a purpose.** Each conversation in Mju belongs to a specific case — it is never a floating chat (for chit-chat, use a chatbot). A case is the natural container of legal work: materials, pleadings, deadlines, schedules, and hard-won experience all belong inside it.
- **The entry point files things for you.** As you type an instruction, Mju detects which case it belongs to (always correctable), and files the task, schedule, or deadline it implies — then reminds you before it's due. Anything unrecognized goes to an inbox board, never lost.
- **Done isn't done until you review it.** Legal work needs a second pair of eyes. Everything the agent produces waits in a "to review" state until you sign off.

## How it works

Four pages — the thread above, unfolded:

- **Entry (`/`)** — a single composer. Type an instruction; Mju detects the owning case and launches an agent session inside that case's folder. Below the composer, an always-on agenda shows what's due across all cases.
- **Case Board (`/board/[caseId]`)** — one kanban per case answering two questions: what's still to do, and what's finished and waiting for my review? A live pulse marks tasks whose agent is running.
- **Task (`/task/[taskId]`)** — the execution floor: the agent's full working process on the left (streaming, tool calls, branches, export), and a live preview of the documents it is writing on the right, so you review as it works. Substantial tasks are delegated to specialized subagents — different models excel at different work, and an agent team saves tokens, raises the hit rate, and keeps each output true to its standard.
- **Dates (`/dates`)** — every task deadline, court deadline, and schedule across all cases, in list, week, or month view. One glance tells you what needs follow-up.

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

Then open [http://localhost:30142](http://localhost:30142). On first run, point Mju at any folder from the entry page:

- Point it at an Obsidian vault and Mju scans `ops/cases/案卷`, `ops/projects/活跃项目`, and similar case folders automatically.
- Point it at an empty folder and Mju generates a standard project skeleton — case structure, `AGENTS.md`, and bundled skills — ready to use.

**Options:**

```bash
mju --port 8080              # custom port
mju --hostname 127.0.0.1     # local access only
mju --no-open                # do not open the browser automatically
```

## Features

- **Case-first, not chat-first**: every agent run is bound to a task on a case board; the task keeps the original instruction and the session id.
- **Full agent chat where it belongs**: streaming, tool-call details, in-session branches, forks (auto-rebound to the task), and HTML export live on the task page.
- **Obsidian as the file layer**: cases are vault folders (`ops/cases/案卷`, `ops/projects/活跃项目` are scanned on init); deliverables are written back as plain markdown you keep. No Obsidian required — any local folder works.
- **Agent teams**: configurable subagents (Justice / Magician / Chariot by default) with per-agent model, tools, and skills; the runtime delegates automatically on substantial work.
- **Material automation**: drop materials onto a case board and Mju classifies pleadings, judgments, and contracts, files them away, and creates review tasks and key deadlines. With a MinerU token configured, PDF/DOCX files convert straight to Markdown.
- **Deadlines that aggregate**: tasks, filing deadlines, and hearings merge into one global dates view with overdue highlighting.
- **Swiss design**: paper/night themes, one signal-red accent, no clutter.
- **Local-first**: sessions in `~/.pi/agent/sessions`, project metadata in `~/.mju/projects`, nothing leaves the machine. The pi runtime and `pi-subagents` are bundled — no separate CLI install needed.

It is not a legal advice service and does not replace professional review. All session files, case metadata, and credentials stay on your machine.

## Roadmap

What's next revolves around one question: making the agent feel more like a colleague the longer you work together.

- **Memory**: today the agent works inside a case and naturally holds that case's full context; what's missing is context about *you* — your working habits, phrasing, and standard positions. A memory layer will distill those over time.
- **Experience replay**: when you repeat a workflow often enough, the agent will offer to distill it into a skill — one click turns "how we do this" into a reusable Skill for next time.

Further plans: [docs/roadmap.md](./docs/roadmap.md).

## Notes

- **Data directories**: sessions `~/.pi/agent/sessions/<encoded-cwd>/*.jsonl`; Mju metadata `~/.mju/projects/<encoded-cwd>/store.json`. Set `PI_CODING_AGENT_DIR` / `MJU_HOME` to relocate.
- **Legacy links**: old `/sessions?session=<id>` URLs redirect to the owning task when one exists.
- **Subagents**: see [Subagents](./docs/subagents.md). **Privacy boundary**: see [Open-source release and privacy](./docs/open-source-release.md).
- **Architecture**: [docs/architecture.md](./docs/architecture.md).

## Development

```bash
npm install
npm run dev    # http://localhost:30142
```

Checks: `npm run typecheck`, `npm run lint`, `npm run test:backend`. Never run `next build` during dev. See [AGENTS.md](./AGENTS.md) for the full file map and design decisions.
