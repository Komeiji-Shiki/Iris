## TODO LIST

<!-- LIMCODE_TODO_LIST_START -->
- [ ] Phase 1: 安装 ink/react 依赖，修改 tsconfig.json 支持 JSX  `#p1-deps`
- [ ] Phase 2: PlatformAdapter 新增 setToolStateManager 钩子，Orchestrator 注入  `#p2-hooks`
- [ ] Phase 3.1: 创建 App.tsx 根组件（状态管理 + 布局）  `#p3-app`
- [ ] Phase 3.3: 创建 InputBar.tsx 输入栏组件  `#p3-input`
- [ ] Phase 3.2: 创建 MessageItem.tsx 消息渲染组件  `#p3-msg`
- [ ] Phase 3.5: 创建 StatusLine.tsx 状态行组件  `#p3-status`
- [ ] Phase 3.4: 创建 ToolCall.tsx 工具状态卡片组件  `#p3-tool`
- [ ] Phase 4: 创建工具专用渲染器（Terminal / ReadFile / Diff / Default）  `#p4-renderers`
- [ ] Phase 5: 重写 ConsolePlatform，对接 ink 渲染与核心层  `#p5-platform`
- [ ] Phase 6: 日志适配，防止 console.log 干扰 ink 渲染  `#p6-logger`
<!-- LIMCODE_TODO_LIST_END -->


# Console TUI 重构实施计划

##前置分析

### 当前状态
- `ConsolePlatform` 基于 `readline`，只有 `console.log` / `process.stdout.write` 输出
- `ToolStateManager` 已就位，提供 `created` / `stateChange` / `completed` 三种事件
- 项目为 CommonJS（`"module": "commonjs"`），需使用 CJS 兼容版本的 ink

### 依赖选型
| 包 | 版本 | 说明 |
|---|---|---|
| `ink` | `^3.2.0` | CJS 兼容的最后大版本 |
| `react` | `^17.0.2` | ink 3 要求 React 17 |
| `@types/react` | `^17` | 类型 |
| `ink-text-input` | `^4.0.0` | 适配 ink 3 的文本输入组件 |
| `ink-spinner` | `^4.0.3` | 适配 ink 3 的加载指示器 |
| `chalk` | `^4.1.2` | CJS 兼容的最后大版本（仅日志/辅助着色） |

### 目标文件结构
```
src/platforms/console/
├── index.ts                  # ConsolePlatform（重写，对接 ink 渲染）
├── App.tsx                   # 根组件：状态中枢
├── components/
│   ├── MessageItem.tsx       # 单条消息渲染（区分 user / model）
│   ├── InputBar.tsx          # 底部输入栏
│   ├── ToolCall.tsx          # 工具调用卡片（状态驱动）
│   └── StatusLine.tsx        # 底部状态行（thinking / 空闲）
└── tool-renderers/
    ├── index.ts              # 渲染器注册表 + 分发
    ├── TerminalRenderer.tsx  # terminal 工具专用渲染
    ├── ReadFileRenderer.tsx  # read_file 工具专用渲染
    ├── DiffRenderer.tsx      # apply_diff / search_replace 渲染
    └── DefaultRenderer.tsx   # 兜底：JSON 折叠渲染
```

---

## Phase 1：环境准备

### 1.1 安装依赖
```bash
npm i ink@^3.2.0 react@^17.0.2 ink-text-input@^4.0.0 ink-spinner@^4.0.3
npm i -D @types/react@^17
```

### 1.2 修改 tsconfig.json
```jsonc
{
  "compilerOptions": {
    // 新增
    "jsx": "react-jsx"
  }
}
```

### 验收标准
- `npx tsc --noEmit` 通过
- 空的 `.tsx` 文件可被编译

---

## Phase 2：扩展核心接口

### 2.1 PlatformAdapter 新增可选钩子

在 `src/platforms/base.ts` 中添加：

```typescript
/** 接收工具状态管理器（可选，由 Orchestrator 调用） */
setToolStateManager?(manager: ToolStateManager): void;
```

这样平台层可以自行监听 `ToolStateManager` 的事件，完全解耦。
Orchestrator 在 `start()` 时检测并调用此钩子。

### 2.2 Orchestrator 注入 ToolStateManager 到平台

在 `start()` 方法中：
```typescript
if (this.platform.setToolStateManager) {
  this.platform.setToolStateManager(this.toolState);
}
```

### 验收标准
- 现有 Discord / Telegram 平台不受影响（钩子为可选）
- ConsolePlatform 可接收 ToolStateManager

---

## Phase 3：构建 TUI 基础组件

### 3.1 App.tsx — 根组件

职责：
- 维护全局状态：消息列表 `ChatMessage[]`、是否正在生成 `isGenerating`、工具调用列表 `ToolInvocation[]`
- 暴露命令式方法供 `ConsolePlatform` 调用（通过 ref 或回调注入）：
  - `appendAssistantText(text: string)` — 非流式文本
  - `startStream()` / `pushStreamCnk(chunk: string)` / `endStream()` — 流式文本
  - `setToolInvocations(invocations: ToolInvocation[])` — 同步工具状态
- 布局：消息列表 → 工具卡片区 → 状态行 → 输入栏

### 3.2 MessageItem.tsx

- 区分 `user` / `assistant` 角色，使用不同颜色前缀
- assistant 消息支持简单的 Markdown 着色（代码块、加粗）

### 3.3 InputBar.tsx

- 使用 `ink-text-input` 接收用户输入
- 正在生成时禁用输入（显示 "AI 思考中..."）
- 支持 `/quit`、`/clear`、`/help` 内置命令

### 3.4 ToolCall.tsx — 工具状态卡片

根据 `ToolInvocation.status` 渲染不同 UI：

| 状态 | 显示 |
|---|---|
| `streaming` | `⏳ tool_name 参数生成中...` |
| `queued` | `⏳ tool_name 排队中` |
| `awaiting_approval` | `⚠️ tool_name 等待批准 [Y/n]` |
| `executing` | `⠋ tool_name 执行中...`（ink-spinner） |
| `awaiting_apply` | `📋 tool_name 等待应用 [Y/n]` |
| `success` | `✅ tool_name` + 折叠结果 |
| `warning` | `⚠️ tool_name` + 折叠结果 |
| `error` | `❌ tool_name: 错误信息` |

结果部分委托给 `tool-renderers/` 中对应的渲染器。

### 3.5 StatusLine.tsx

- 空闲时显示提示文字
- 生成中显示 spinner + "AI 正在思考..."
- 工具执行中显示 "执行工具 N/M..."

### 验收标准
- 各组件可独立渲染，不依赖 ConsolePlatform 实例
- ToolCall 能正确根据 8 种状态显示不同 UI

---

## Phase 4：工具专用渲染器

### 4.1 渲染器注册表 `tool-renderers/index.ts`

```typescript
const renderers: Record<string, React.FC<ToolRendererProps>> = {
  terminal: TerminalRenderer,
  read_file: ReadFileRenderer,
  apply_diff: DiffRenderer,
  search_replace: DiffRenderer,
};
export function getRenderer(toolName: string): React.FC<ToolRendererProps> {
  return renderers[toolName] ?? DefaultRenderer;
}
```

### 4.2 TerminalRenderer.tsx
- 显示执行的命令（带 `$` 前缀）
- stdout 用默认色，stderr 用黄色
- 退出码非零时用红色标注

### 4.3 ReadFileRenderer.tsx
- 显示文件路径、行范围
- 内容区用灰色/暗色显示，带行号

### 4.4 DiffRenderer.tsx
- 显示文件路径
- 搜索模式：列出匹配行
- 替换/diff 模式：显示 applied/failed 统计

### 4.5 DefaultRenderer.tsx
- 将结果 JSON.stringify 后截断显示（超过 N 行折叠）

### 验收标准
- 每个渲染器能正确处理对应工具的 `result` 数据结构
- 未知工具 fallback 到 DefaultRenderer

---

## Phase 5：重写 ConsolePlatform

### 5.1 ConsolePlatform 改造

核心变化：
- `start()` 中调用 `ink.render(<App />)` 挂载视图
- 通过回调/ref 获得 App 的命令式 API
- `sendMessage()` → 调用 App 的 `appendAssistantText()`
- `sendMessageStream()` → 调用 App 的 `startStream()` / `pushStreamChunk()` / `endStream()`
- `setToolStateManager()` → 监听事件，调用 App 的 `setToolInvocations()`
- `stop()` → 卸载 ink 实例

### 5.2 输入流对接
- App 中 `InputBar.onSubmit` → 调用 `this.messageHandler()`
-内置命令（`/quit` 等）在 App 层处理，不传给 messageHandler

### 验收标准
- 完整对话流程可用：输入 → AI 回复 → 工具执行（带状态显示） → 最终回复
- 流式输出正常工作
- 工具状态实时更新

---

## Phase 6：日志适配

### 6.1 问题
ink 接管了 stdout，`console.log` 会破坏 ink 的渲染。
现有 `Logger` 类直接使用 `console.log/debug/warn/error`。

### 6.2 方案
在 `ConsolePlatform.start()` 中，将全局日志级别设为 `SILENT`，
或改造 Logger 支持写入文件而非 stdout。
开发调试时可通过环境变量恢复日志输出到 stderr。

### 验收标准
- ink 渲染不被日志干扰
- 调试时仍可查看日志
