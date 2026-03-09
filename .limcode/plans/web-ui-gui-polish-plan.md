## TODO LIST

<!-- LIMCODE_TODO_LIST_START -->
- [x] 审视当前 Vue GUI 的布局、视觉层级、交互弱点与可复用样式变量  `#audit-current-ui`
- [x] 确定推荐的 GUI 美化方向与设计语言（暗色、毛玻璃、圆角、层次、动效）  `#define-visual-direction`
- [x] 规划设计令牌、组件级样式改造点与主样式文件调整范围  `#draft-style-system`
- [x] 拆分 Sidebar、Message、Input、Settings 等组件的具体优化方案  `#plan-component-updates`
- [x] 生成 GUI 美化实施计划文档并附带验收清单  `#write-plan-doc`
<!-- LIMCODE_TODO_LIST_END -->

# Web UI GUI 美化实施计划

## 目标
在不大改业务结构的前提下，提升当前 `web-ui` 聊天界面的：

- 视觉层次
- 品牌感
- 交互细腻度
- 响应式体验
- 可维护性

## 当前界面观察
结合现有 `web-ui/src/styles/main.css` 与组件结构，当前 UI 已具备基础暗色风格，但主要问题在于：

1. **整体偏“纯平”**
   - 背景、侧边栏、消息区、输入区都以纯色块为主。
   - 缺少明显的 surface 层级、阴影、边框高光、材质感。

2. **控件视觉统一度不够**
   - 按钮、输入框、面板、消息气泡圆角和阴影风格还不够统一。
   - `☰`、`⚙`、`×` 这类字符按钮功能可用，但高级感较弱。

3. **聊天区缺少“内容容器感”**
   - 消息区目前是全幅铺开，视觉焦点不够集中。
   - 输入框区和消息区衔接偏硬。

4. **交互反馈较轻**
   - hover、active、focus、展开/收起、面板出现等动效较少。
   - 移动端侧边栏打开方式较直接，缺少遮罩和过渡层次。

5. **设置面板信息密度高但分组感弱**
   - 目前更像功能表单，少“卡片分区”和辅助说明。

## 推荐视觉方向
建议采用：

### 方向：**暗色 Apple-like Soft UI / 轻毛玻璃聊天面板**
关键词：

- 暗色基底
- 柔和渐变
- 半透明 surface
- 细边框高光
- 大圆角
- 轻阴影
- 低对比但清晰的层次
- 细腻 hover / blur / transform 动效

这类风格适合你现在的 AI 聊天产品，因为它：

- 能保留当前暗色主题基础
- 不需要重构组件结构
- 很适合 Sidebar / Modal / Input / Message Bubble 这些块状区域
- 比“纯霓虹赛博风”更耐看，也更适合长期使用

## 实施范围
主要涉及以下文件：

- `web-ui/src/styles/main.css`
- `web-ui/src/App.vue`
- `web-ui/src/components/AppSidebar.vue`
- `web-ui/src/components/ChatInput.vue`
- `web-ui/src/components/MessageBubble.vue`
- `web-ui/src/components/MessageList.vue`
- `web-ui/src/components/SettingsPanel.vue`
- `web-ui/src/components/ToolBlock.vue`
- `web-ui/src/views/ChatView.vue`

---

## 分阶段方案

### Phase 1：建立设计令牌与背景层次
先改全局样式系统，避免组件各自为政。

#### 1.1 扩充 CSS 变量
在 `:root` 中补充：

- 背景渐变色
- surface 半透明色
- 1/2/3 级阴影
- 高光边框色
- 更细的文本层级
- 控件 hover / active 色
- 统一圆角尺寸
- 统一 transition 曲线

建议新增变量类别：

- `--surface-1`
- `--surface-2`
- `--surface-glass`
- `--border-soft`
- `--shadow-sm/md/lg`
- `--radius-sm/md/lg/xl`
- `--text-tertiary`
- `--accent-soft`

#### 1.2 做全局背景
将当前纯底色改为：

- 深色线性渐变背景
- 叠加 1~2 个低透明 radial glow
- 页面根节点增加轻微噪点或模糊氛围（可选，先不引入图片）

目标：让页面从“纯色背景”变成“有氛围但不花哨”的工作界面。

---

### Phase 2：重做布局观感

#### 2.1 App 根布局
当前 `app-root` 是简单两栏网格。建议：

- 保留两栏结构不动
- 给主聊天区增加左右留白
- 聊天区内部增加 `max-width` 容器
- 在移动端加入侧边栏遮罩层

#### 2.2 Sidebar 优化
目标：从“列表栏”提升到“导航面板”。

建议：

- 侧边栏使用更深但带透明层次的背景
- 增加右侧内阴影/分隔高光
- 标题与新建按钮区独立成块
- 会话列表项改为卡片式 hover
- 当前 active 会话增加：
  - 更亮背景
  - 轻描边
  - 左侧强调条或 glow
- 删除按钮默认弱化，hover 时浮现更自然

可选升级：

- 会话列表项显示最近时间 / 简短摘要（若后端暂不提供可先不做）
- Logo 增加副标题，如 `AI Workspace`

---

### Phase 3：消息区与气泡升级

#### 3.1 消息容器
当前消息区建议改成“中间内容流”布局：

- 列表本身保持滚动
- 每条消息限制最大宽度，如 `680px ~ 760px`
- 用户消息和模型消息有不同材质

#### 3.2 MessageBubble 优化
建议：

- 用户消息：
  - 使用更明确的品牌色渐变或柔和高亮底
  - 保留右对齐
  - 增加轻阴影
- 模型消息：
  - 使用半透明卡片底
  - 增加边框高光
  - Markdown 区域优化段落间距、代码块间距、引用块样式

#### 3.3 流式输出状态
当前已用 `▊` 光标，可增强为：

- 更柔和的闪烁
- 流式消息顶部/边缘轻微高亮
- 回复生成时可在尾部增加极轻 loading 感

#### 3.4 工具块 ToolBlock
建议改成更像“系统日志折叠卡片”：

- header 使用中性对比面板
- 展开图标旋转更平滑
- body 增加内边距和代码字体层级
- call / response 两种状态有不同色标

---

### Phase 4：输入区做成核心视觉焦点
`ChatInput` 是最值得打磨的区域。

建议：

1. 输入区做成底部浮动面板，而不是简单顶部分隔线
2. textarea 使用：
   - 更大圆角
   - 更柔和背景
   - 聚焦时描边 glow
3. 发送按钮改成主按钮风格：
   - 渐变底色
   - hover 上浮 1~2px
   - disabled 状态更自然
4. 整体输入区加：
   - 半透明背景
   - blur
   - 阴影
   - 顶部细边框

如果愿意再进一步，可以加入：

- 快捷提示（Enter 发送 / Shift+Enter 换行）
- 输入为空时的 placeholder 动画弱化

---

### Phase 5：设置面板做成真正的“配置中心”
当前 `SettingsPanel.vue` 功能完整，但视觉较像基础表单。

建议：

- 头部加说明副标题
- 表单按模块分组：
  - LLM
  - 连接
  - 系统
  - 工具状态
- 每个分组使用卡片容器
- label 与 input 间距更统一
- `保存配置` 区域固定在底部或视觉更突出
- 状态提示改成 toast-like / badge-like 文案样式

低成本高收益优化：

- provider 的 select 做更好 hover/focus
- API Key 输入增加“已配置”提示
- tool tag 更像胶囊 chips

---

### Phase 6：补齐交互细节

#### 6.1 动效
统一 transition：

- hover：`150ms ~ 200ms`
- panel/modal：`220ms ~ 280ms`
- easing：柔和曲线，不要过弹

推荐应用位置：

- Sidebar item hover
- Button hover/press
- ToolBlock collapse
- SettingsPanel 出现/关闭
- Mobile Sidebar 进出

#### 6.2 焦点可访问性
当前美化时不要丢掉可用性：

- 所有按钮和输入框保留明显 focus ring
- 文本与背景保持足够对比度
- 不要只靠颜色区分状态

#### 6.3 空态与弱状态
建议补充：

- 欢迎界面增加插画感标题区或说明卡片
- 会话为空时优化文案
- 加载历史时可加 skeleton / subtle loading
- 保存配置成功时给予更正向反馈

---

## 推荐落地顺序
为降低返工，建议按下面顺序做：

1. **先改 `main.css` 的设计令牌与全局背景**
2. **再改布局：App / ChatView / MessageList / ChatInput**
3. **再改 Sidebar / MessageBubble / ToolBlock**
4. **最后打磨 SettingsPanel 和动画细节**

原因：

- 先有变量系统，再改组件成本最低
- 输入区和消息区最影响整体观感，应优先
- 设置面板属于次高频区域，可后置

---

## 建议的最小可交付版本（MVP 美化）
如果想先快速出效果，优先做这 6 件事：

1. 全局背景渐变 + surface 变量
2. Sidebar 改成毛玻璃导航面板
3. 聊天区加中间内容宽度限制
4. MessageBubble 增加卡片感和层次
5. ChatInput 改成浮动玻璃输入栏
6. SettingsPanel 改成卡片式表单

只做这几项，整体观感就会明显提升。

---

## 验收标准
完成后建议至少满足：

- 一眼看上去不再像“基础后台页”，而像成熟聊天产品
- 主视觉焦点明确：消息内容 + 输入栏
- Sidebar、消息、设置面板三类 surface 层级清楚
- hover / focus / active 反馈统一
- 移动端侧边栏体验更自然
- CSS 变量可复用，后续换主题不需要大改组件

---

## 可选增强项（第二阶段）
如果第一版效果满意，可以继续做：

- 引入图标系统（如 Lucide）替换字符按钮
- 增加浅色主题 / 跟随系统主题
- 增加消息操作条（复制、重试、折叠）
- 增加页面微粒子/氛围背景
- 优化代码块高亮
- 加入更完整的动效系统（Vue transition）

## 结论
这套 GUI 不需要推倒重做，**主要问题不是结构，而是视觉系统和交互细节偏基础**。最合适的策略是：

**在保留现有 Vue 组件结构的基础上，先统一设计变量，再对 Sidebar / ChatInput / MessageBubble / SettingsPanel 做分层美化。**

这样投入可控、风险低，且最终效果会比单纯“换几个颜色”明显高级很多。
