# Variant: 纸感 Zine 海报（Zine paper-poster skin）

### Design stance
现有"白底黑字信号红"过于朴素——像一份没印出来的文件。本稿把它升级为**已经印出来的刊物**：仿旧纸暖底、纸纹颗粒、暖墨黑、小字号编辑排印，红色从"UI 强调色"变成"油墨"。克制是前提：只有一层极淡颗粒、一处套色错位、一类印刷色块，绝不走向装饰堆砌。

参考：gc-minimal-zine-poster 的纸感/负空间/单一高饱和锚点语言；frakio-work 的 token 分层、color-mix 派生、统一缓动与短入场动效。

### Key choices
- Color: `--bg` 纯白 `#fff` → 暖米白 `#faf6ec`；`--text` 纯黑 → 暖墨 `#211d16`；night 同步改为暖调深纸 `#1a1712`。锚点色恒为 `#e30613` 信号红，不轮换
- Texture: 全局一层 SVG feTurbulence 纸纹（multiply，opacity ≈ .055；night 用 screen ≈ .07），`pointer-events: none`，零交互成本
- Typography: 品牌字标与页面大标题加轻微**套色错位**（红/青 ±1px text-shadow）；入口页 hero 加档案微文字行（mono 10px，日期 · 地点 · 在办数）；短 hairline（2.5rem）替代部分整宽边框
- Ink: 执行中状态由"呼吸点"改为**实心红色块 + 大写微标签**（红戳感）；新卡 `inset 3px 0 0` 红条保留
- Motion: 统一 `--ease-out: cubic-bezier(.2,.8,.2,1)`；入场收敛到 120–200ms + 4–6px 位移；全部配 `prefers-reduced-motion` 降级
- Shadow: 浮层三层叠加（1px 描边 + 近阴影 + 远阴影），漫射低对比，不做玻璃拟态

### Trade-offs
- Strong at: 质感与品牌个性显著提升，改动面极小——色值全部走 CSS 变量，内联样式自动跟随；不引入任何新依赖（无字体包、无动画库、无图标库）
- Weak at: 纸纹在高刷新率屏幕上属"感觉到了但说不出"的层级，收益主观；暖底色对习惯了纯白的用户需要适应期；套色错位若滥用会显脏，必须只给字标和大标题

### 落地映射
- `app/globals.css`: 两套令牌换纸感色板；新增纸纹伪元素 + `--grain-opacity` / `--ease-out` / `--overlay-shadow` 令牌；keyframes 时长收敛
- `components/Wordmark.tsx`: 套色错位（新 CSS 类 `.misreg`，night 模式调透明度）
- `components/EntryPage.tsx`: hero 档案微文字行 + hairline；其余组件不动代码，换肤跟随令牌
- 顺手清理 `ChatInput.tsx` 两处绕过令牌的硬编码色（文件状态条）

### Best for
- 把每次代理协作当作"一份印出来的档案"的工作方式：纸感强化归档感，红色油墨强化"待验收/执行中"的信号性
