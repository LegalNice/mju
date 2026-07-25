# Subagent 与任务看板

Mju Agents 使用内置的 Pi 运行时和 `pi-subagents` 负责运行时发现和委派，同时保留可视化配置界面。用户不需要另外安装 Pi CLI。

## 配置位置

- 本机全局 Agent：`~/.pi/agent/agents/*.md`
- 当前项目 Agent（默认）：`~/.mju/projects/<编码路径>/agents/*.md`
- 兼容路径（低优先级）：`<项目目录>/.mju/agents/*.md`、`<项目目录>/.pi/agents/*.md`
- 同名时，当前项目配置优先于全局配置。
- 仓库中的 `.pi/settings.json` 只负责注册 `pi-subagents`，不保存 API key，也不保存个人 Agent 定义。

界面可以选择全局或项目作用域。准备开源时，只有适合公开、且对贡献者有帮助的 Agent 才应放入仓库；项目特定的 Agent 应留在 `~/.mju/projects/<编码路径>/agents/`，避免把客户/案件信息带入仓库。

## 使用 Obsidian 工作区测试

可以在界面中选择任意本地 Obsidian 库作为工作区进行测试。该库属于运行时输入，不属于本仓库：不要复制、提交或打包库中的会话、案件材料、`.agents`、`.pi/agents`、个人路径或截图。

测试时建议使用一个专门的脱敏测试库，并在发布前从干净 clone 启动一次，确认应用不依赖你的个人库才能运行。

## 运行方式

安装依赖后，pi 运行时会提供原生 `subagent`、`subagent_wait` 和 supervisor 工具。自然语言配置通过本地 `configure_subagent` 工具完成，并写入 pi-subagents 使用的 Markdown Agent 格式。

## 看板、技能与 MCP

看板把任务分配给指定 Agent，并通过 `pi-subagents` 执行；它不能替代对产出文件和 Agent 会话的人工复核。技能和 MCP 服务器按 Agent 显式选择，应遵循最小权限原则，只分配完成职责所需要的能力。
