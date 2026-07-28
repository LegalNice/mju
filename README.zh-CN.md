# Mju Agents

[English](./README.md) · [npm](https://www.npmjs.com/package/@tttangerine/mju) · [路线图](./docs/roadmap.md)

> 你的严格但公正的法律助手：从一句话开始，把经过复核的工作落到正确案件里。

![Mju Agents 进入页](https://raw.githubusercontent.com/LegalNice/mju/feature/subagents-ui/docs/screenshots/entry.png)

<p align="center">
  <img src="https://raw.githubusercontent.com/LegalNice/mju/feature/subagents-ui/docs/screenshots/case-board.png" alt="Mju 案件看板" width="49%" />
  <img src="https://raw.githubusercontent.com/LegalNice/mju/feature/subagents-ui/docs/screenshots/dates.png" alt="Mju Dates 视图" width="49%" />
</p>

截图使用完全虚构的案件和任务数据，不包含客户、案件或账户信息。

## 为什么做 Mju

法律人不需要一个留满技术配置空间的工具。日常工作从哪里开始，Agent 就应该从哪里开始——而法律工作几乎总是从一句话开始：「帮我看看这个案子」「下周三要交答辩状」「约一下当事人」。

所以 Mju 只有一条主线：**你说一句话，它把这句话变成案件里的一件正事。**

几个贯穿始终的原则：

- **每段对话都有目的。** Mju 里的每次对话都落在某一个具体案件里，而不是悬空的闲聊——闲聊请去 ChatBot。案件是法律工作的天然容器：材料、文书、期限、日程、经验，全都应该收在案件里。
- **入口替你归位。** 输入指令时，Mju 会主动识别它属于哪个案件（识别错了随时可改），顺手把任务、日程、截止时间落下来，并在到期前提醒你。识别不了的先进「通用任务」收件箱，不会丢。
- **做完不等于完成。** 法律工作需要复核。Agent 产出的每件事都停在「待 Review」状态，由你过目后才算数。

## 从一句话到经你复核的工作

1. **从进入页开始。** 用日常语言描述事项；Mju 匹配所属案件（随时可改）、创建任务，并在该案件文件夹内启动 Agent。
2. **在案件看板推进。** 材料、任务、Agent 会话、期限和交付物始终绑定同一案件，不再散落在聊天标签和文件夹里。
3. **经复核才算完成。** 任务页保留 Agent 的工作过程和文档预览；专业判断与最终确认始终由你作出。

## 工作台结构

四个页面，就是上面这条主线的展开：

- **进入页（`/`）**——只有一个输入框。输入指令，自动识别归属案件，在该案件文件夹里启动 Agent 会话。输入框下方常驻「近期在办」，不用打字也能看到各案件即将到期的事项。
- **案件看板（`/board/[caseId]`）**——每个案件一个看板，回答两个问题：这个案子还有哪些待办？哪些做完了等我 Review？Agent 正在执行的任务卡片上有脉冲标记。
- **任务子页（`/task/[taskId]`）**——点开任务卡片进入执行现场：左栏是 Agent 的完整工作过程（流式输出、工具调用、分支、导出），右栏是它正在撰写的文档的实时预览，边看边 Review。复杂任务会自动分派给不同的子 Agent——不同模型各有所长，组成 Agent Team 既省 Token、提高命中率，也让产出更贴近各自的标准。
- **全局 Dates（`/dates`）**——跨案件聚合所有任务截止、诉讼期限和日程，列表 / 周 / 月三种视图，一眼看清近期要跟进什么。

## 快速开始

**免安装直接运行：**

```bash
npx @tttangerine/mju@latest
```

**或全局安装：**

```bash
npm install -g @tttangerine/mju
mju
```

然后打开 [http://localhost:30142](http://localhost:30142)。首次使用，在进入页指向任意文件夹即可：

- 如果指向 Obsidian 文件库，Mju 会自动扫描 `ops/cases/案卷`、`ops/projects/活跃项目` 等目录；
- 如果指向空文件夹，Mju 会自动生成标准项目结构、案件骨架、`AGENTS.md` 和内置 skills，直接上手。

**参数：**

```bash
mju --port 8080              # 自定义端口
mju --hostname 127.0.0.1     # 仅本机访问
mju --no-open                # 不自动打开浏览器
```

## 功能

- **案件优先，不是聊天优先**：每次 Agent 运行都绑定在案件看板的一个任务上，任务保存原始指令和会话 id。
- **完整对话在它该在的地方**：流式输出、工具调用详情、会话内分支、fork（自动回写任务绑定）、HTML 导出，都在任务子页。
- **Obsidian 是文件层**：案件就是文件库文件夹（初始化时自动扫描 `ops/cases/案卷`、`ops/projects/活跃项目`）；交付物以纯 markdown 写回，永远属于你。不用 Obsidian 也行，任何本地文件夹都能初始化。
- **Agent 团队**：可配置的子 Agent（默认 Justice / Magician / Chariot），各自独立的模型、工具和技能；遇到复杂任务运行时会自动分派。
- **材料自动化**：在案件看板上传材料，系统自动识别起诉状、判决书、合同等类型并归位，生成审阅任务和关键期限；配置 MinerU 后，PDF/DOCX 也能直接转成 Markdown 入库。
- **期限自动聚合**：任务截止、举证期限、开庭日程合并进同一个全局 Dates 视图，逾期标红。
- **瑞士风设计**：纸白 / 墨黑双主题，全场唯一的信号红点缀，没有多余装饰。
- **本地优先**：会话存在 `~/.pi/agent/sessions`，项目元数据存在 `~/.mju/projects`，数据不出本机。pi 运行时和 `pi-subagents` 已内置，无需单独安装 CLI。

它不是法律意见服务，也不替代专业复核。所有会话文件、案件元数据和凭证都留在你自己的机器上。

## 路线图

正在做的方向，都围绕同一个问题：让 Agent 越用越像你的同事。

- **记忆沉淀**：现在 Agent 在案件里工作，自然掌握了案件的全部上下文；缺的是对「你」的上下文——你的工作习惯、表达偏好、常用口径。未来会增加记忆系统，把这些沉淀下来。
- **经验复现**：重复做过几遍的工作流，Agent 会主动提示「要不要沉淀为技能」，一键生成可复用的 Skill，下次同类工作直接调用。

更远的规划见 [docs/roadmap.md](./docs/roadmap.md)。

## 说明

- **数据目录**：会话 `~/.pi/agent/sessions/<编码路径>/*.jsonl`；Mju 元数据 `~/.mju/projects/<编码路径>/store.json`。可用 `PI_CODING_AGENT_DIR` / `MJU_HOME` 改位置。
- **旧链接**：老的 `/sessions?session=<id>` 链接会自动重定向到所属任务（如果能找到的话）。
- **子 Agent**：见 [Subagents 文档](./docs/subagents.zh-CN.md)；**开源隐私边界**：见 [开源发布与隐私](./docs/open-source-release.zh-CN.md)。
- **架构**：[docs/architecture.md](./docs/architecture.md)。

## 开发

```bash
npm install
npm run dev    # http://localhost:30142
```

检查：`npm run typecheck`、`npm run lint`、`npm run test:backend`。开发时不要跑 `next build`。完整文件地图和设计决策见 [AGENTS.md](./AGENTS.md)。
