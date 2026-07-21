# Contributing

## 开发

```bash
npm install
npm run dev
```

提交前运行：

```bash
node_modules/.bin/tsc --noEmit
npm run lint
```

开发时不要运行 `next build`；生产构建只在发布流程中执行。

## 提交边界

- 不提交 API key、会话文件、客户材料、本地路径或 `config/local/`。
- 不把个人 Obsidian 库、`~/.pi/agent/agents/` 或项目 `.pi/agents/` 配置复制进仓库。
- 涉及文件访问、模型认证、Subagent 工具权限或 MCP 的改动，应同时补充测试或说明。
- 问题或合并请求应包含最小安全复现、预期行为和实际行为。

Mju Agents 优先保持本地运行、权限可见、配置可检查，并尽量与 pi 和 pi-subagents 的公开格式兼容。
