# Subagents and task board

Mju Agents bundles the Pi runtime and uses `pi-subagents` for runtime
discovery and delegation while retaining a visual configuration panel. A
separate Pi CLI installation is not required.

## Configuration scope

- User-wide agents: `~/.pi/agent/agents/*.md`
- Project agents: `~/.mju/projects/<encoded-cwd>/agents/*.md`（默认，存放在工作区之外，Obsidian 库保持纯文档）
- 兼容读取：旧版 `<project>/.mju/agents/*.md` 和 `<project>/.pi/agents/*.md` 也会被读取，同名时新位置优先
- 项目级 agent 通过 `PI_SUBAGENT_EXTRA_AGENT_DIRS` 注册给 pi-subagents，以 user 级身份参与委派
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
