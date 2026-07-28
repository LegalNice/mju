---
name: task-do
description: Create, update, complete, and time-track task, schedule, and deadline pages in the current Mju case workspace. Use when the user asks to 新建任务, 记一个任务, 建立任务页, 新建日程, 记一个日程, 安排会议, 新建期限, 记一个期限, 截止提醒, 标记完成, 这个任务结束了, 这个日程结束了, 补录工时, task do, or when legal/case work should be recorded under a case folder's 任务/, 日程/, or 期限/ folder.
---

# Task Do

Create and maintain task, schedule, and deadline pages in the current Mju project.

Use this skill whenever the user wants a task, schedule, or deadline recorded, updated, completed, or time-tracked.

## Where to create files

The current working directory is usually a case folder. If it contains `任务/`, `日程/`, `期限/` subdirectories, create files directly inside them:

- Tasks go under `任务/`.
- Schedules go under `日程/`.
- Deadlines go under `期限/`.

If the current directory is the project root (not a specific case) and contains `ops/common/任务/` and `ops/common/日程/`, create general items there instead.

## Core Rule

New task frontmatter uses this shape:

```yaml
---
事项类型: 任务
状态: 待办 | 进行中 | 完成 | 取消
分类: 文书 | 检索 | 跟进 | 会议 | 其他
开始时间: YYYY-MM-DDTHH:mm:00
结束时间: YYYY-MM-DDTHH:mm:00
截止日期: YYYY-MM-DD
描述: |
  简短描述任务内容
备注: |
  补充信息、产出的文件链接等
---
```

New schedule frontmatter uses this shape:

```yaml
---
事项类型: 日程
状态: 待办 | 进行中 | 完成 | 取消
分类: 开庭 | 会议 | 沟通 | 出差 | 其他
开始时间: YYYY-MM-DDTHH:mm:00
结束时间: YYYY-MM-DDTHH:mm:00
描述: |
  简短描述日程内容
备注: |
  补充信息、地点、关联文件等
---
```

New deadline frontmatter uses this shape:

```yaml
---
事项类型: 期限
状态: 待办 | 进行中 | 完成 | 取消
分类: 举证 | 答辩 | 上诉 | 缴费 | 保全 | 其他
截止日期: YYYY-MM-DD
描述: |
  简短描述期限内容
备注: |
  补充信息、关联文件等
---
```

Allowed frontmatter fields for task pages:

- `事项类型`
- `状态`
- `分类`
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
- `创建时间`

Allowed frontmatter fields for schedule pages:

- `事项类型`
- `状态`
- `分类`
- `开始时间`
- `结束时间`
- `描述`
- `备注`

Apply the same legacy-field exclusions to schedule pages.

Allowed frontmatter fields for deadline pages:

- `事项类型`
- `状态`
- `分类`
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

1. Identify the target case or project.
2. For substantive new tasks (drafting, review, litigation strategy, evidence organization, legal research, client proposal), first do the reuse precheck from `case-workflow`: search existing cases/projects and `templates/` for reusable templates or finished documents. Skip this for pure registration, follow-up, delivery, schedule, or deadline items.
3. Create the file in the appropriate `任务/` directory.
4. Use a concise filename that matches the task title.
5. Set `状态`:
   - `待办` for future tasks.
   - `进行中` for active tasks.
   - `完成` when the user says the task is already finished.
   - `取消` when the user cancels it.
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

1. Identify the target case or project.
2. Create the file in the appropriate `日程/` directory.
3. Use a concise filename that names the case/project and event.
4. Fill `开始时间` and `结束时间` when known.
5. Set `状态`:
   - `待办` for current or upcoming schedule items.
   - `完成` when the schedule already happened.
6. Keep the body short:

```markdown
## 事项

## 关联文件
```

## Deadline Creation

1. Identify the target case or project.
2. Create the file in the appropriate `期限/` directory.
3. Use a concise filename that names the case/project and deadline.
4. Fill `截止日期` when known.
5. Set `状态`:
   - `待办` for active or upcoming deadlines.
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
5. Normalize times to ISO-like local format:
   - `YYYY-MM-DDTHH:mm:00`
6. Set `状态: 完成`.
7. Fill `开始时间` and `结束时间`.

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
- `创建时间`

Keep `事项类型: 任务` for task pages, `事项类型: 日程` for schedule pages, and `事项类型: 期限` for deadline pages.
