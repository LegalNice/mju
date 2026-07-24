---
name: task-do
description: Create, update, complete, and time-track task, schedule, and deadline pages in the user's Obsidian/Notion-style vault. Use when the user asks to 新建任务, 记一个任务, 建立任务页, 新建日程, 记一个日程, 安排会议, 新建期限, 记一个期限, 截止提醒, 标记完成, 这个任务结束了, 这个日程结束了, 补录工时, task do, or when legal/case work should be recorded under an案卷/任务, 案卷/日程, or 案卷/期限 folder. Shared for Codex and Hermes.
---

# Task Do

Create and maintain task and schedule pages in the current project root (the directory the agent session runs in, or its closest parent containing `ops/`).

Use this skill whenever the user wants a task, schedule, or deadline recorded, updated, completed, or time-tracked.

For legal case work:

- Tasks go under `ops/cases/案卷/<案卷名>/任务/`.
- Schedules go under `ops/cases/案卷/<案卷名>/日程/`.
- Deadlines go under `ops/cases/案卷/<案卷名>/期限/`.
- Bases are shared from `ops/cases/任务.base`, `ops/cases/日程.base`, and `ops/cases/期限.base`; case-local task/schedule/deadline base files are archived.

## Core Rule

New task frontmatter uses this shape:

```yaml
---
base: "[[ops/cases/任务.base|任务.base]]"
事项类型: 任务
关联项目:
  - "[[ops/cases/案卷/<案卷名>/<案卷名>|<案卷名>]]"
性质: 工作
分类: 文书
状态: 进行中
开始时间:
结束时间:
描述:
截止日期:
备注:
---
```

New schedule frontmatter uses this shape:

```yaml
---
base: "[[ops/cases/日程.base|日程.base]]"
事项类型: 日程
关联项目:
  - "[[ops/cases/案卷/<案卷名>/<案卷名>|<案卷名>]]"
性质: 工作
分类: 会议
状态: 进行中
开始时间:
结束时间:
描述:
备注:
---
```

New deadline frontmatter uses this shape:

```yaml
---
base: "[[ops/cases/期限.base|期限.base]]"
事项类型: 期限
关联项目:
  - "[[ops/cases/案卷/<案卷名>/<案卷名>|<案卷名>]]"
性质: 工作
分类: 期限
状态: 进行中
截止日期:
描述:
备注:
---
```

Allowed frontmatter fields for task pages:

- `base`
- `事项类型`
- `关联项目`
- `性质`
- `分类`
- `状态`
- `开始时间`
- `结束时间`
- `截止日期`
- `描述`
- `备注`

Legacy fields stay out of newly created task pages:

- `Assignee`
- `类型`
- `关联案件`
- `已删除`
- `用时（小时）`
- `创建时间`

`用时（小时）` belongs in `.base` as a formula calculated from `开始时间` and `结束时间`.

Allowed frontmatter fields for schedule pages:

- `base`
- `事项类型`
- `关联项目`
- `性质`
- `分类`
- `状态`
- `开始时间`
- `结束时间`
- `描述`
- `备注`

Apply the same legacy-field exclusions to schedule pages.

Allowed frontmatter fields for deadline pages:

- `base`
- `事项类型`
- `关联项目`
- `性质`
- `分类`
- `状态`
- `截止日期`
- `描述`
- `备注`

Apply the same legacy-field exclusions to deadline pages.

## Task Or Schedule

Choose `任务` when the item is a deliverable, to-do, drafting/review work, court filing work, follow-up, or work that should count toward service time.

Choose `日程` when the item is a meeting, hearing, call, visit, deadline-adjacent appointment, or calendar event with a specific time window.

Choose `期限` when the item is a court deadline, limitation period, filing deadline, freeze expiry, payment deadline, renewal date, or any item centered on a `截止日期`.

If the user's wording contains both, prefer the user's label. If the label is missing, infer from the substance and file location.

## Task Creation

1. Identify the target project/case.
2. 对实质性新任务（起草、审查、诉讼策略、证据整理、法律研究、客户方案）先按 `case-workflow` 完成跨库复用预检：检索同类案卷/项目、模板与既有文书、`wiki/distilled/`、`shared-memory/工作流/`；仅在用户提及已有记录时定向检索 `life/日记/`、`ops/daily/` 或 Get笔记。单纯登记、催办、寄送、日程和期限事项可跳过。
3. Create the file in `ops/cases/案卷/<案卷名>/任务/`.
4. Use a concise filename that matches the task title.
5. Set `状态`:
   - `进行中` for active tasks.
   - `完成` when the user says the task is already finished.
6. Fill `开始时间` and `结束时间` only when known.
7. Keep the body short. For a substantive task, retain the final section; if no useful result was found, write `未发现可安全复用的材料`:

```markdown
## 背景

## 工作内容

## 产出

## 检索与复用
```

For completed work, include a link to the produced document in `备注` and `## 产出`.

## Schedule Creation

1. Identify the target project/case.
2. Create the file in `ops/cases/案卷/<案卷名>/日程/`.
3. Use a concise filename that names the case/project and event.
4. Fill `开始时间` and `结束时间` when known.
5. Set `状态`:
   - `进行中` for current or upcoming schedule items.
   - `完成` when the schedule already happened.
6. Keep the body short:

```markdown
## 事项

## 关联文件
```

## Deadline Creation

1. Identify the target project/case.
2. Create the file in `ops/cases/案卷/<案卷名>/期限/`.
3. Use a concise filename that names the case/project and deadline.
4. Fill `截止日期` when known.
5. Set `状态`:
   - `进行中` for active or upcoming deadlines.
   - `完成` when the deadline has been handled.
6. Keep the body short:

```markdown
## 事项

## 处理记录
```

## Completing A Task

When the user says a task or schedule is done, finished, completed, or "这个任务结束了" / "这个日程结束了":

1. Locate the most likely task or schedule page by title, case name, recent context, and `状态`.
2. If the target is ambiguous, ask which item.
3. If `开始时间` or `结束时间` is missing, ask for the missing time before completing the task.
4. Accept natural time answers such as:
   - `1630`
   - `16:30`
   - `下午4点半`
   - `刚刚`
   - `今天17:09`
5. Normalize times to ISO-like local vault format:
   - `YYYY-MM-DDTHH:mm:00`
6. Set `状态: 完成`.
7. Fill `开始时间` and `结束时间`.
8. Leave `用时（小时）` to the base formula.

If the user says the task or schedule is complete and gives one time only, treat it as `结束时间` and ask for `开始时间`.

## Mobile / Hermes Flow

Hermes may receive short mobile messages such as:

- `这个任务结束了`
- `这个日程结束了`
- `刚才那个完成了`
- `兴众为那个任务结束，1630到1709`
- `上午那个客户会议结束了，930到1119`
- `帮我把今天那个合同审查记一下，已经完成`

Use this flow:

1. Search recent task pages and current conversation context.
2. Confirm the target only when more than one item could match.
3. Ask for missing `开始时间` and `结束时间` in one short question.
4. Update the task or schedule page directly after the user answers.

Example question:

`这个事项我来标记完成。开始时间和结束时间分别是几点？`

## Existing Task Cleanup

When updating an existing task or schedule, preserve user-written body content. Clean frontmatter only when the update touches that item directly.

For old pages that already contain legacy fields, remove legacy fields during the update if doing so is in scope:

- `Assignee`
- `类型`
- `关联案件`
- `已删除`
- `用时（小时）`
- `创建时间`

Keep `事项类型: 任务` for task pages, `事项类型: 日程` for schedule pages, and `事项类型: 期限` for deadline pages.

## Base Formula

Task list bases may display `用时（小时）` as a formula:

```yaml
formulas:
  用时（小时）: 'if(note["开始时间"] && note["结束时间"], (((number(note["结束时间"]) - number(note["开始时间"])) / 3600000).round(2)).toString() + "小时", "")'
```

Display it in `properties` and view `order` as:

```yaml
formula.用时（小时）:
  displayName: 用时（小时）
```

## References

Before broad changes, check:

- `schema.md`
- `Templates/ops/任务模板.md`
- `Templates/ops/日程模板.md`
- `Templates/ops/期限模板.md`
- `ops/cases/任务.base`
- `ops/cases/日程.base`
- `ops/cases/期限.base`
