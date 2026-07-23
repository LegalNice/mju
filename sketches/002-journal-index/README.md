## Variant: 刊物目录（Journal index）

### Design stance
会话是"文章"，首页是"目录"。用刊物的信息层级（期号 / 编号 / 标题 / 摘要行）组织会话历史，点进去是阅读视图，返回键回目录。

### Key choices
- Layout: 目录页 860px 居中大列表；阅读页 760px；导航靠"返回目录"而非侧栏
- Typography: 19px 700 大标题 + 12px 元信息行；编号用 tabular-nums
- Color: 黑粗线（2px）做"期刊书眉"，红仅作运行态方块与 hover
- Interaction: 点击条目进入阅读视图，"← 返回目录"返回

### Trade-offs
- Strong at: 最有"艺术感"和个性；历史会话的可读性、可检索性最好
- Weak at: 新建对话的入口不突出；并发监控多个运行中任务不方便；案件/任务管理仍是外挂

### Best for
- 把每次代理协作当作一件"作品/档案"沉淀下来反复阅读的工作方式
