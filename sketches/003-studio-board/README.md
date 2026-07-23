## Variant: 工作台（Studio board）

### Design stance
工作对象优先，对话退为工具。首页是案件的任务看板（待办/进行中/完成），右侧常驻 400px 对话坞，点哪张卡就和哪个代理接着聊。

### Key choices
- Layout: 左看板（弹性宽）+ 右对话坞（400px 固定），无左侧栏
- Typography: 看板卡片 13px 600；列头微型标签 + 计数
- Color: 红仅用于逾期左边条和发送键
- Interaction: 点卡片切换对话坞上下文

### Trade-offs
- Strong at: 任务状态一目了然；对话和任务天然绑定；最适合"多案件并行"的真实工作
- Weak at: 最像"工具软件"（Linear 既视感）；纯聊天场景显得重；移动端最难做

### Best for
- 以案件/任务为中心、代理是执行者的工作流——也最贴合 mju 第二、三阶段（任务/工作流）的演进方向
