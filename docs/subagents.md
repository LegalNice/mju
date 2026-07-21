# Subagents and task board

Mju Agents bundles the Pi runtime and uses `pi-subagents` for runtime
discovery and delegation while retaining a visual configuration panel. A
separate Pi CLI installation is not required.

## Configuration scope

- User-wide agents: `~/.pi/agent/agents/*.md`
- Project agents: `<project>/.pi/agents/*.md`
- Project definitions take precedence when names collide.
- `.pi/settings.json` registers the package only; it does not contain API keys
  or private agent definitions.

An Obsidian vault or another local workspace can be selected for testing. It is
runtime input, not repository content. Do not copy its sessions, case files,
`.agents`, `.pi/agents`, personal paths, or screenshots into this repository.

The task board assigns work to a configured agent and delegates it through
`pi-subagents`. It is an orchestration view, not a replacement for reviewing
the resulting files and transcript. Skills and MCP servers are selected per
agent; keep those selections limited to the minimum required capability.
