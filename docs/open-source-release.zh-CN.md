# 开源发布与隐私边界

## 可以发布

- 源代码、测试、文档和通用示例配置。
- 只包含包名（例如 `npm:pi-subagents`）的 `.pi/settings.json`。
- 不含私有 registry 凭据的锁文件。

## 不得发布

- `~/.pi/agent/auth.json`、`models.json`、会话 JSONL 文件和 API key。
- 含客户、案件或个人信息的项目 `.pi/agents/*.md`。
- 你的 Obsidian 库及其 `.agents`、`.pi/agents`、本地审计日志、私人截图和导出会话。
- `config/local/`、`.next/`、`.env*`、私有证书、访问令牌和 Cookie。

## 第一次公开推送前

1. 确认许可证、GitHub 仓库和 npm 包身份。
2. 检查 `git diff --cached` 和 `git status --short --ignored`。
3. 在待发布文件中搜索个人路径、客户名称、密钥和本地服务地址。
4. 从干净 clone 按文档安装和启动，不依赖个人 Obsidian 库。
5. 记录上游修改和第三方许可证。

应用可以读取和修改用户选择的工作区、调用模型供应商、安装技能以及调用 MCP。使用前应复核工具权限和供应商配置。

正式 npm 包名为 `@tttangerine/mju`。发布前应在 `package.json` 填入最终 GitHub 仓库地址；不得保留上游仓库信息。
