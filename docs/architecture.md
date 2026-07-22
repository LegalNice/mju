# Mju Agents 架构说明

## 三层架构

```
┌─────────────────────────────────────┐
│  Mju Core Layer (开源核心)           │
│  - 法律领域模型                      │
│  - 案件/任务/期限/日程管理            │
│  - Agent Teams 配置                 │
│  - 工作流引擎                        │
│  - Web UI (Next.js)                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Pi Runtime Layer (执行引擎)         │
│  - pi coding agent SDK              │
│  - pi-subagents 扩展                │
│  - 模型调用、工具执行                 │
│  - MCP 服务器连接                   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Storage Layer (文件存储)            │
│  - Obsidian Vault (推荐)            │
│  - 纯本地 .mju/ 模式 (无 Obsidian)   │
│  - Markdown 文件、模板、案卷         │
└─────────────────────────────────────┘
```

---

## 数据流

### 案件数据

1. Mju 启动时读取当前工作目录
2. 如果是 Obsidian vault（存在 `.obsidian/`），扫描 `ops/cases/案卷/` 和 `ops/projects/活跃项目/`
3. 案卷元数据写入 `.mju/store.json`
4. 案件文件（Markdown、材料）仍留在 Obsidian 原位置

### 任务数据

1. 任务创建/状态变更时，写入 `.mju/store.json`
2. 可选同步到 Obsidian 任务文件（未来实现）
3. 任务执行通过 pi-subagents 调用对应 Agent

### Agent 配置

1. 默认存储在 `.mju/agents/*.md`
2. 可选同步到 Obsidian `.pi/agents/` 供 pi CLI 使用
3. 每个 Agent 可绑定模型、工具、技能、MCP

---

## 关键设计决策

### 1. 为什么区分 advisory / litigation？

常年法律顾问和争议解决是两种完全不同的工作流：

| 方面 | 顾问项目 | 诉讼案件 |
|------|---------|---------|
| 核心对象 | 客户 | 案件 |
| 关键日期 | 合同期限、回复期限 | 开庭日期、举证期限 |
| 交付物 | 审查意见、咨询回复 | 起诉状、代理词、庭审提纲 |
| 阶段 | 收案 → 审查 → 意见 → 交付 | 收案 → 材料 → 检索 → 起草 → 庭前 → 开庭 |

### 2. 为什么 Obsidian 是首选存储？

- 用户已有大量案卷数据在 Obsidian 中
- Markdown 是法律文书的自然格式
- Obsidian 的链接和图谱对案件管理有价值
- iCloud 同步解决多设备问题

### 3. 为什么 Mju 元数据要独立？

- Obsidian 文件是"正式档案"，不应被工具随意修改
- Mju 的任务状态、Agent 指派是"工作过程"，变动频繁
- 分离后，Mju 卸载或损坏不会污染 Obsidian 数据
- 其他用户不用 Obsidian 也能使用 Mju

### 4. 为什么需要纯本地模式？

- 保证 Mju 可开源，不强制要求 Obsidian
- 其他法律团队可能用其他文件管理方式
- 降低新用户上手门槛

---

## 目录结构

```
mju/
├── app/
│   ├── api/
│   │   ├── projects/init/     # 项目初始化
│   │   ├── cases/             # 案件 CRUD
│   │   ├── tasks/             # 任务 CRUD（第二阶段）
│   │   ├── deadlines/         # 期限 CRUD（第二阶段）
│   │   ├── schedules/         # 日程 CRUD（第二阶段）
│   │   ├── workflows/         # 工作流（第三阶段）
│   │   ├── deliverables/      # 交付物（第四阶段）
│   │   └── ...
│   └── page.tsx               # 主入口
├── components/
│   ├── CaseBoard.tsx          # 案件看板
│   ├── TaskBoard.tsx          # 任务看板
│   ├── SubagentsConfig.tsx    # Agent 配置
│   ├── DeadlinePanel.tsx      # 期限面板（第二阶段）
│   ├── WorkflowLauncher.tsx   # 工作流启动器（第三阶段）
│   └── ...
├── lib/
│   ├── mju-models.ts          # 法律领域模型
│   ├── mju-store.ts           # .mju 数据层
│   ├── mju-obsidian.ts        # Obsidian 桥接
│   ├── design-system.ts       # Kimi 风格设计系统
│   ├── default-agents.ts      # 默认 Agent 配置（第三阶段）
│   ├── workflows.ts           # 工作流引擎（第三阶段）
│   ├── docx-generator.ts      # DOCX 生成（第四阶段）
│   └── ...
└── docs/
    ├── roadmap.md             # 本路线图
    └── architecture.md        # 本文件
```

---

## 开发规范

### 代码检查

每次提交前必须运行：

```bash
node_modules/.bin/tsc --noEmit
npm run lint
```

### 组件开发

- 新组件优先使用 `lib/design-system.ts` 中的颜色和样式
- 保持 Kimi 风格：暖白底、暖橙红 accent、轻阴影、自然圆角
- 动画使用 `animationCss` 中的关键帧，避免自定义复杂动画

### API 开发

- 所有 API 路由必须验证 `cwd` 参数
- 错误返回格式：`{ error: string }`
- 成功返回格式：`{ success: true, ... }` 或具体数据

### 数据存储

- 项目级数据：`<cwd>/.mju/store.json`
- 用户级配置：`~/.mju/config.json`（未来）
- Agent 定义：`<cwd>/.mju/agents/*.md`

---

## 与上游 pi-web 的关系

Mju 是 `agegr/pi-web` 的 fork，但已经朝独立产品方向发展：

- **保留**：pi agent 集成、会话管理、模型配置、技能/MCP 管理
- **改造**：案件管理替代简单 cwd 选择、法律领域模型、工作流引擎
- **新增**：Obsidian 桥接、任务/期限/日程系统、DOCX 交付

上游更新（如 v0.7.17 的 shell 命令前缀）会定期评估是否合并，但法律工作流功能优先于上游同步。
