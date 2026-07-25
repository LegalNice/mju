# Mju Agents 法律工作台重构路线图

> 本文档是 Mju Agents 的产品和技术规划，供人类开发者和 AI Agent 共同阅读。
>
> 当前状态：**第一、二阶段已完成；第三阶段工作流已完成（前后端均已接入）；IA 重构（进入页 → Board → Dates → 任务子页）已完成；第四阶段交付物/DOCX 已完成；第五阶段通用化与开源准备已完成（5.1/5.3/5.4 完成，5.2 核心配置外置完成，Obsidian 路径映射延后）；第六阶段材料自动化 MVP 已完成。**

## 目标

把当前以 pi-web 思维组织的 Mju Agents，重构为：

> **一个以法律工作流为中心、本地优先、可开源的 Agent Teams 工作台。**

- **第一优先级**：满足法律人的日常工作需求
- **第二优先级**：架构可开源，不强制绑定特定 Obsidian 结构

Obsidian 不是"可选同步目标"，而是**首选文件存储层**。Mju 在 Obsidian 之上提供项目/案件管理、任务调度、Agent 协作、期限提醒和 DOCX 交付能力。

---

## 核心原则

1. **法律领域模型优先**：先定义 Client、Case、Task、Deadline、Schedule、Deliverable，再谈通用架构。
2. **区分业务类型**：常年法律顾问（Advisory）和争议解决（Litigation）是两种工作流，不是同一种"项目"。
3. **Obsidian 是主文件库**：案卷、材料、文书、模板仍在 Obsidian；Mju 不迁移数据，而是读取和增强。
4. **Mju 元数据独立**：任务状态、Agent 指派、工作流进度存在 `~/.mju/projects/<编码路径>/`，与 Obsidian 文件解耦。
5. **可退回纯本地模式**：没有 Obsidian 时，Mju 元数据仍在 `~/.mju/`，文件存在项目目录，保证可开源。
6. **小步验证**：每阶段跑 `tsc --noEmit`、`npm run lint`、dev server 手动点验。

---

## 领域模型

```typescript
// 客户（顾问业务）
interface Client {
  id: string;
  name: string;                    // 客户名称
  type: "company" | "individual";
  contact?: string;
  contractPeriod?: { start: string; end: string };  // 顾问合同期限
  vaultPath?: string;              // Obsidian 中对应目录
}

// 案件/项目
interface Case {
  id: string;
  title: string;
  type: "advisory" | "litigation"; // 常年顾问 / 争议解决
  clientId?: string;               // 顾问案件关联客户
  parties?: { plaintiff?: string; defendant?: string; other?: string[] };  // 诉讼当事人
  court?: string;                  // 审理法院
  caseNumber?: string;             // 案号
  stage: string;                   // 当前阶段（收案/材料/起草/庭前/开庭/结案）
  status: "active" | "dormant" | "closed";
  vaultPath: string;               // Obsidian 案卷路径
  createdAt: string;
}

// 任务（增强版）
interface Task {
  id: string;
  caseId: string;
  title: string;
  detail: string;
  assignee: string;                // Agent 名称（Justice/Magician/Chariot）
  status: "待办" | "进行中" | "完成" | "取消";
  priority?: "high" | "medium" | "low";
  deadline?: string;               // 截止时间
  estimatedHours?: number;         // 预估工时
  actualHours?: number;            // 实际工时
  deliverableType?: "internal-opinion" | "external-opinion" | "docx-revision" | "pleading" | "evidence-list" | "trial-outline" | "research-report" | "other";
  deliverablePath?: string;        // 交付物文件路径
  relatedFiles?: string[];         // 关联材料
  createdAt: string;
  completedAt?: string;
}

// 期限（硬 deadline，独立于任务）
interface Deadline {
  id: string;
  caseId: string;
  title: string;                   // 如"举证期限届满"
  date: string;
  type: "court" | "filing" | "client" | "internal";
  status: "pending" | "done" | "missed";
}

// 日程（会议、开庭）
interface Schedule {
  id: string;
  caseId: string;
  title: string;                   // 如"开庭"
  datetime: string;
  location?: string;
  type: "court-hearing" | "client-meeting" | "internal-meeting" | "other";
}

// 交付物
interface Deliverable {
  id: string;
  caseId: string;
  taskId?: string;
  title: string;
  type: Task["deliverableType"];
  filePath: string;                // 在 Obsidian 或项目目录中的路径
  status: "draft" | "internal-review" | "client-review" | "final" | "archived";
  version: number;
  createdAt: string;
}
```

---

## 第一阶段：法律领域模型 + Obsidian 桥接 ✅ 已完成

### 已实现

- `lib/mju-models.ts`：Client、Case、Task、Deadline、Schedule、Deliverable 类型定义
- `lib/mju-store.ts`：`.mju/store.json` 读写
- `lib/mju-obsidian.ts`：Obsidian vault 检测和案卷扫描
- `app/api/projects/init/route.ts`：项目初始化
- `app/api/cases/route.ts`：案件列表和创建
- `components/CaseBoard.tsx`：案件看板 UI（Kimi 风格）
- `lib/design-system.ts`：共享设计系统

### 验证结果

- 空文件夹可初始化 Mju 项目
- Obsidian vault 可扫描出案卷列表
- 类型检查和 lint 通过

---

## 第二阶段：任务、期限、日程管理 ✅ 已接入

### 2.1 任务 API ✅

- `app/api/tasks/route.ts`
  - GET/POST/PATCH/DELETE，操作 `~/.mju/projects/<编码路径>/store.json` 中的 tasks
  - 支持按 caseId、status、deadline 筛选
- `app/api/deadlines/route.ts`：期限增删改查
- `app/api/schedules/route.ts`：日程增删改查

### 2.2 法律任务看板 ✅

- `components/LegalTaskBoard.tsx`
  - 任务卡片显示：标题、Agent、截止时间、优先级、交付物类型
  - 支持按 待办/进行中/完成/取消 分组
  - 支持按截止时间排序，逾期任务高亮
  - 任务详情可编辑截止时间、预估工时、实际工时

### 2.3 期限与日程面板 ✅

- `components/DeadlinePanel.tsx`（新）
  - 显示最近 7 天、30 天的期限和日程
  - 逾期标红，即将到期标黄
- 已集成到 AppShell 顶部入口；支持 7 / 30 天视图和期限完成标记

### 验证

- `tsc --noEmit`、`npm run lint`、`git diff --check` 通过
- 已在桌面和 390px 窄屏实际核验任务、期限与日程面板布局

---

## 第三阶段：Agent Teams 与工作流 🟡 后端已完成

### 3.1 法律 Agent 默认配置

- `lib/default-agents.ts`
  - `justice`：法律分析、策略规划（默认 GPT）
  - `magician`：文书起草、文风润色（默认 Kimi K3）
  - `chariot`：法律检索、任务执行、文件整理（默认 DeepSeek）
  - 保留用户自定义能力：可改名、可换模型、可加新 Agent
- `app/api/agents/route.ts`
  - 默认操作 `~/.mju/projects/<编码路径>/agents/*.md`
  - 保留可选同步到 Obsidian `.pi/agents/` 供 pi CLI 使用

### 3.2 工作流引擎 ✅

- `lib/workflows.ts`：内置争议解决、合同审查、专项检索三类工作流；按案件类型筛选，并生成带负责人、优先级、交付物和截止日的任务。
  - `litigation-intake`：收案 → 材料整理 → 法律检索 → 文书起草 → 庭前准备
  - `contract-review`：合同接收 → 法条检索 → 风险分析 → 内部意见 → 对外修订版
  - `legal-research`：检索 → 报告
  - 每个工作流定义阶段序列，每阶段生成对应任务并指派 Agent
- `app/api/workflows/route.ts`
  - GET：列出案件可用工作流及是否已启动
  - POST `{ caseId, workflowId, action: "preview" | "start" }`：预览或启动工作流；启动会写入任务和运行记录，并拒绝重复启动

### 3.3 工作流 UI ✅ 已完成

- 案件 Board 刊头提供"启动工作流 ▾"入口
- 预览模态展示任务清单 + assignee + 优先级 + 截止
- 确认后批量创建任务；已启动置灰并给出 409 提示

### 验证

- 后端测试覆盖预览不落库、诉讼工作流生成 5 项任务、运行记录持久化和重复启动冲突
- 前端启动器已 CDP 端到端实测

---

## 第 3.5 阶段：IA 重构（进入页 → Board → Dates → 任务子页）✅ 已完成

把原先的「IDE 式单页 + 模态框」结构改为以任务流为中心的多页结构：

### 路由

- `/`：进入页（`components/EntryPage.tsx`）——大 composer，无侧栏；输入时本地模糊匹配归属案件（案件 title/parties/court/caseNumber 作为子串命中指令文本），chip 可改派；未识别归入「通用任务」收件箱（`ensureInboxCase`，vault 下 `ops/inbox`）；启动时一次 `POST /api/agent/new`（cwd = 案件 vaultPath，创建即提示词）+ `POST /api/tasks`（cwd = 项目根，写入 `sessionId`/`originPrompt`），过渡动画后跳转对应案件 Board
- `/board/[caseId]`：案件 Board（`components/CaseBoardView.tsx`）——刊头 + 全案件切换下拉 + 三列看板；`sessionId` 在运行集合中的任务卡显示脉冲「执行中」；`/board` 索引页按 `localStorage mju-last-case` 重定向
- `/dates`：全局 Dates（`components/DatesView.tsx`）——跨案件聚合 tasks/deadlines/schedules，列表时间轴 / 周视图 / 月日历三视图分段切换（`localStorage mju-dates-view`），条目点击穿透到案件 Board 或任务子页
- `/task/[taskId]`：任务子页（`components/TaskDetailView.tsx`）——左栏指令 + 会话工作流时间线（SSE 实时）+ 追问 composer；右栏案件 markdown 文档列表 + `MarkdownBody` 实时预览（运行中 3s 轮询）
- `/sessions`：原聊天工作台（AppShell 整体迁入，保留 `?session=` 深链；顶栏 Cases/Tasks/Dates 模态框入口已移除，旧组件 CaseBoard/LegalTaskBoard/DeadlinePanel 已删除）

### 数据层

- `Task` 新增 `sessionId?` / `originPrompt?`（任务 ↔ pi 会话绑定）；`MjuStore` 新增 `cwd?`（writeStore 自动回填）
- 新路由：`GET /api/projects`（枚举 `~/.mju/projects`，fs 回溯解码连字符路径）、`GET /api/casedocs`（案件 vaultPath 下 md 按 mtime 倒序，自动 `allowFileRoot`）
- `POST /api/cases {action:"ensure_inbox"}`：幂等创建「通用任务」收件箱案件

### 已确认待后续

- 未识别指令的 AI 兜底分类（本轮仅本地匹配 + 通用任务收件箱）
- 跨项目聚合的全局 Dates（本轮为当前项目全局）
- 通用任务收件箱的出口精细化

---

## 第 3.6 阶段：/sessions 退役 ✅ 已完成

旧聊天工作台（AppShell + SessionSidebar + FileExplorer/FileViewer/TabBar）整体下线：

- 任务子页左栏升级为完整聊天：`TaskDetailView` 以合成 `SessionInfo` + `key={sessionId}` 挂载 `ChatWindow`（流式、工具详情、ChatInput 全套控制、音效），`BranchNavigator` inline 分支导航、`导出` 链接（`/api/sessions/[id]/export?inline=1`）；fork 自动 PATCH 回写任务的 sessionId 绑定
- 无 sessionId 的任务可在子页「启动会话」（ensure_session + 绑定）
- `/sessions` 变为重定向页：`?session=<id>` 经 `findTaskBySessionId()` 反查到任务则跳 `/task/[taskId]`，否则回 `/`
- 进入页补项目初始化闭环（无项目/多项目选择器均可内联初始化，Obsidian vault 自动扫案卷）
- 历史会话不提供任何 UI 入口（.jsonl 保留在磁盘）；随手聊统一归入「通用任务」收件箱

---

## 下一阶段：任务流转与智能归属 ✅ 已完成（1.1.0）

**背景**：退役后日常路径是「进入页 → Board → 任务聊天」。链路上最弱的两环——归属识别只是案件名字段的子串匹配（「那个顾问合同」「上周那个案子」必然漏进通用任务）；通用任务是死胡同，任务不能改派、状态没有 UI 入口。

### 第 1 步：通用任务出口 + 任务流转 ✅

- Board 卡片 hover 显现 `⋯` 菜单：状态切换（待办/进行中/完成）+ 改派到其它案件（含收件箱）
- 任务子页 meta 行：`状态 ▾` 和 `改派 ▾` 两个 micro 菜单；改派后右栏文档自动切换到新案件
- 验收：端到端点击改派，任务实时换案（CDP 实测通过）

### 第 2 步：AI 兜底识别 ✅

- 新端点 `POST /api/classify {cwd, instruction}`：案件列表 + 指令发给默认模型，返回编号映射 caseId；收件箱不作为候选；15s 超时
- 进入页双防抖：200ms 本地匹配 → 800ms 无本地命中且 ≥8 字自动调 classify（chip「识别中…」）；递增序号丢弃过期响应；launch 会 await 在飞的 classify
- 验收：CDP 实测「学知义那个顾问合同续签」→ 识别中… → 识别为 常法-学知义

### 第 3 步：工作流启动器接入案件 Board ✅

- 刊头「启动工作流 ▾」→ 预览模态（任务清单 + assignee + 优先级 + 截止）→ 确认启动；已启动置灰，409 模态内提示；启动后自动刷新任务列

### 明确不做

拖拽换列、跨项目 Dates、DOCX 交付（第四阶段，等任务流转顺了再说）。

---

## 第四阶段：交付物与 DOCX 生成 ✅ 已完成

### 4.1 交付物管理 ✅

- `app/api/deliverables/route.ts`：GET/POST/PATCH/DELETE（状态机 draft → internal-review → client-review → final → archived，版本号）
- 案件 Board「交付物」区：卡片（标题/类型/版本/状态 chip），点 chip 推进状态；任务子页 meta 下方显示关联交付物

### 4.2 Markdown → DOCX 管道 ✅

- `app/api/deliverables/generate/route.ts`：pandoc 本机执行（无需新增 npm 依赖）；输出与源 md 同目录、重名自动 `-2`；sourcePath 强制限制在案件文件夹内
- 模板：`templates/legal/*.docx` 经 `--reference-doc` 注入，GET 返回可用模板列表
- 生成后自动登记 Deliverable 并回写 `task.deliverablePath`
- 任务子页右栏文档行 hover 出 `DOCX` 按钮（有模板时浮层选择）→ 导出 → `已导出 ✓` + 相对路径反馈

### 4.3 交付 UI ✅

- 任务完成后一键生成 DOCX（4.2 右栏按钮）；Board/子页交付物状态可视化与推进

### 同批完成：任务中断与删除

- Board 卡片 ⋯ 菜单：`中断执行`（运行中可点，POST {type:"abort"}）+ `删除任务`（两步确认，运行中先 abort 再删）
- 任务子页 meta 行：`中断`（运行中显示）+ `删除`（两步确认后返回 Board）

### 验证

- deliverables CRUD 测试通过；pandoc 生成经 `file` 验证为真 Word 文档；Board 删除流程、状态推进、DOCX 按钮均 CDP 端到端实测

---

## 第五阶段：通用化与开源准备 🟡 进行中（5.1/5.3 已完成；5.2/5.4 部分完成）

### 5.1 纯本地模式 ✅ 已完成

- 当目录不是 Obsidian vault 时，Mju 自动切换到纯本地模式
- 案卷元数据存在 `~/.mju/projects/<编码路径>/store.json`，文件存在项目目录
- 新建案件/收件箱时自动生成标准骨架（`任务/`、`期限/`、`日程/`、`材料/`、`分析/`、`文书/`、`工作包/`、`大事记/`）和案件主文件
- 项目初始化时自动生成 `AGENTS.md` 指导与内置 skills，保证无 Obsidian 用户也能使用
- 已通过 dev server 端到端验证：空文件夹 → 初始化 → 新建案件，结构与主文件自动生成

### 5.2 配置外置 🟡 部分完成

- `~/.mju/config.json` 已支持 `classifyModel` 和 `agents.justice/magician/chariot` 显示名自定义
- `~/.mju/workflows.json` 可覆盖内置工作流；非法时自动回退到内置三条
- `~/.mju/config.json` 已支持 `docx.templatesDir`，可覆盖默认 `<cwd>/templates/legal`
- **延后**：Obsidian 路径映射外置（当前仍用标准 `ops/` 结构）

### 5.3 清理与文档 ✅

- 全局搜索替换 `LegalNice`、`pi-web` 残留（剩余 `roadmap.md` 历史记录和 `.pi/` 路径中的运行时状态）
- `docs/subagents.zh-CN.md` 已更新：说明 `~/.mju/projects/<编码路径>/agents/` 是默认位置，`.pi/agents` 仅为历史兼容
- `docs/architecture.md` 已存在
- `README.zh-CN.md` 已更新：说明 Obsidian 是推荐存储，非必需

### 5.4 测试 ✅ 已补齐 roadmap 列出的四项

- `lib/mju-store.test.mjs`（原有）：隔离 store、迁移、异常处理
- 新增 `lib/mju-guidance.test.mjs`：骨架目录幂等创建、主文件不覆盖、guidance 只写一次
- 新增 `lib/workflows.test.mjs`：预览不落库、诉讼工作流生成 5 任务、重复启动冲突、workflows.json 覆盖/非法回退、Agent 显示名映射
- 新增 `lib/mju-models.test.mjs`：`createEmptyStore`、`DEFAULT_STORE`、`touchStore`
- 新增 `lib/docx-generator.test.mjs` + `app/api/deliverables/generate/route.test.mjs`：模板扫描、唯一输出路径、路径穿越拒绝、路由校验
- 跑通 `tsc --noEmit`、`npm run lint`、`node --test lib/*.test.mjs app/api/deliverables/generate/route.test.mjs`

### 验证

- 无 Obsidian 的空文件夹能初始化 Mju 并运行完整工作流（已通过 dev server + API 端到端验证）
- 有 Obsidian 的 vault 能扫描案卷、同步任务、生成 DOCX

---

## 第六阶段：材料自动化 ✅ 已完成（MVP）

### 6.1 后端

- `POST /api/cases/[caseId]/materials`：接收 `multipart/form-data`，文件保存到案件 `材料/` 目录；支持 `error` / `overwrite` / `skip` 冲突策略
- `POST /api/cases/[caseId]/materials/analyze`：基于文件名和扩展名自动分类，高置信度文件自动移入 `文书/` 或 `分析/`；从文件名提取日期并创建 `期限/` / `日程/`；创建 `大事记/` 记录和审阅任务
- `lib/material-intelligence.ts`：规则引擎 + 日期提取 + 期限推断，不依赖 OCR/PDF 解析库

### 6.2 前端

- `CaseBoardView` 刊头增加「上传材料」按钮，选择文件后自动上传并分析
- 分析完成后刷新任务列表，并在刊头下方显示处理摘要

### 6.3 测试

- `lib/material-intelligence.test.mjs`：分类、日期提取、期限推断
- `app/api/cases/[caseId]/materials/route.test.mjs`：上传、冲突策略
- `app/api/cases/[caseId]/materials/analyze/route.test.mjs`：自动归位、期限创建、任务创建

---

## 验收标准

1. 能区分创建 顾问项目 和 诉讼案件
2. 任务有截止时间、工时、交付物类型，能按时间排序
3. 有全局面板显示最近期限和开庭日程
4. 能启动"合同审查"工作流，自动生成多 Agent 任务链
5. 任务完成后能生成 DOCX 交付物并保存到 Obsidian
6. 不使用 Obsidian 时，Mju 仍能独立运行完整功能
7. `tsc --noEmit` 和 `npm run lint` 无错误
8. README 能让无 Obsidian 的用户跑起来，也能让 Obsidian 用户接入现有 vault

---

## 风险与回退

- **风险**：改动涉及 AppShell、TaskBoard、agents、board 多个核心文件，可能破坏现有功能
- **回退**：每阶段完成后在 dev server 点验；出问题用 `git stash`/`git checkout` 回退
- **兼容**：保留 pi-subagents 运行时调用路径不变；Obsidian 扫描失败时优雅降级到纯本地模式
- **范围控制**：DOCX 生成依赖外部库，若复杂可先只做 Markdown 交付，后续迭代

---

## 当前设计系统

Mju 采用瑞士国际主义平面风格（Swiss / International Typographic Style）：

- 白场（paper）/ 黑场（night）双主题，全场唯一装饰色为信号红 `#e30613`
- 新怪诞字体栈（Helvetica Neue / 苹方），层级靠字重与字号，无衬线
- 分隔一律 1px 细线；圆角统一 2px；无渐变、无纹理、无装饰阴影（仅模态浮层保留一档）
- 微型标签排版：10-11px 大写、letterSpacing .08-.12em、fontWeight 700
- 统计数字使用 tabular-nums

共享设计系统位于 `lib/design-system.ts`（token 经 `app/globals.css` 的 CSS 变量解析，组件自动跟随主题）。
