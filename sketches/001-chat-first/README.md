## Variant: 对话优先（Chat-first）

### Design stance
首页即对话。砍掉常驻侧栏，会话导航收进 ⌘K 面板和首页的"最近会话"短列表，注意力全部给输入框。

### Key choices
- Layout: 单栏居中 720px，无侧栏；会话通过 ⌘K 覆盖层检索
- Typography: 大字标 + 微型标签；列表 600 字重单行
- Color: 白场 + 信号红仅用于字标、发送键、hover
- Interaction: ⌘K 打开会话面板；Esc 关闭

### Trade-offs
- Strong at: 专注、干净、上手零成本；最不像 IDE
- Weak at: 多会话并行管理弱；文件浏览器无处安放；深度依赖键盘

### Best for
- 一次只专注一件工作、把 mju 当"代理对话工具"而非"项目管理工具"的用法
