# μ Mju Agents

[English](./README.md)

面向法律从业者的本地优先 Agent 工作台。Mju 把案件文件夹（最好是 Obsidian 文件库）变成一组案件看板，把你输入的每一条指令变成一个背后挂着完整 AI 会话的任务。

它不是法律意见服务，也不替代专业复核。所有会话文件、案件元数据和凭证都留在你自己的机器上。

![Mju Agents 进入页](./docs/screenshot-entry.png)

## 工作方式

四个页面，一条主线：

- **进入页（`/`）**——只有一个输入框。输入指令，Mju 自动识别归属案件（识别结果随时可改），在该案件文件夹里启动 Agent 会话，然后带你进入案件看板。输入框下方常驻「近期在办」，不用打字也能看到各案件即将到期的事项。
- **案件 Board（`/board/[caseId]`）**——每个案件一个看板（待办 / 进行中 / 完成），Agent 正在执行的任务卡片上有脉冲标记。每个案件对应文件库里的一个文件夹。
- **任务子页（`/task/[taskId]`）**——左栏是与 Agent 的完整对话（流式输出、工具调用、分支、导出），右栏是 Agent 正在撰写的 markdown 文档的实时预览。
- **全局 Dates（`/dates`）**——跨案件聚合所有任务截止、诉讼期限和日程，列表 / 周 / 月三种视图切换，点击任意条目跳回所属案件。

识别不了归属的随手提问会进入「通用任务」收件箱看板——每段对话都是一个可追踪的任务，不会丢。

## 快速开始

**免安装直接运行：**

```bash
npx mju@latest
```

**或全局安装：**

```bash
npm install -g mju
mju
```

然后打开 [http://localhost:30142](http://localhost:30142)。首次使用，在进入页指向你的 Obsidian 文件库（或任意文件夹）即可——文件库会自动扫描案卷文件夹。

**参数：**

```bash
mju --port 8080              # 自定义端口
mju --hostname 127.0.0.1     # 仅本机访问
mju --no-open                # 不自动打开浏览器
```

## 功能

- **案件优先，不是聊天优先**：每次 Agent 运行都绑定在案件看板的一个任务上，任务保存原始指令和会话 id。
- **完整对话在它该在的地方**：流式输出、工具调用详情、会话内分支、fork（自动回写任务绑定）、HTML 导出，都在任务子页。
- **Obsidian 是文件层**：案件就是文件库文件夹（初始化时自动扫描 `ops/cases/案卷`、`ops/projects/活跃项目`）；交付物以纯 markdown 写回，永远属于你。
- **Agent 团队**：可配置的子 Agent（默认 Justice / Magician / Chariot），各自独立的模型、工具和技能；遇到复杂任务运行时会自动分派。
- **期限自动聚合**：任务截止、举证期限、开庭日程合并进同一个全局 Dates 视图，逾期标红。
- **瑞士风设计**：纸白 / 墨黑双主题，全场唯一的信号红点缀，没有多余装饰——进入页还有探照灯式配置条（模型、技能、Agent、插件、主题）。
- **本地优先**：会话存在 `~/.pi/agent/sessions`，项目元数据存在 `~/.mju/projects`，数据不出本机。pi 运行时和 `pi-subagents` 已内置，无需单独安装 CLI。

## 说明

- **数据目录**：会话 `~/.pi/agent/sessions/<编码路径>/*.jsonl`；Mju 元数据 `~/.mju/projects/<编码路径>/store.json`。可用 `PI_CODING_AGENT_DIR` / `MJU_HOME` 改位置。
- **旧链接**：老的 `/sessions?session=<id>` 链接会自动重定向到所属任务（如果能找到的话）。
- **子 Agent**：见 [Subagents 文档](./docs/subagents.zh-CN.md)；**开源隐私边界**：见 [开源发布与隐私](./docs/open-source-release.zh-CN.md)。

## 路线图与架构

- **路线图**：[docs/roadmap.md](./docs/roadmap.md)——下一步：任务改派、AI 归属识别、工作流启动器。
- **架构**：[docs/architecture.md](./docs/architecture.md)。

## 开发

```bash
npm install
npm run dev    # http://localhost:30142
```

检查：`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm run test:backend`。开发时不要跑 `next build`。完整文件地图和设计决策见 [AGENTS.md](./AGENTS.md)。
