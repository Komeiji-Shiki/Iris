## TODO LIST

<!-- LIMCODE_TODO_LIST_START -->
- [ ] 安装 ink, react, ink-text-input 等依赖，并修改 tsconfig.json  `#tui-1`
- [ ] 扩展 PlatformAdapter 和 Orchestrator，增加工具执行相关的上报钩子  `#tui-2`
- [ ] 创建 TUI 组件（App.tsx, InputArea, MessageList 等基础组件）  `#tui-3`
- [ ] 创建特定工具渲染器 (tools/terminal.tsx, tools/read-file.tsx 等)  `#tui-4`
- [ ] 重写 ConsolePlatform (src/platforms/console/index.tsx)，对接 Ink 和核心层  `#tui-5`
<!-- LIMCODE_TODO_LIST_END -->

# Console TUI 重构计划 (基于 Ink)

## 一、目标与依赖

- **目标**：使用 `ink`、`react` 和 `ink-text-input` 构建现代 TUI，替换原有的 `readline` 纯文本界面。
- **解耦设计**：
  - 核心层（Orchestrator）通过新增加的生命周期钩子（如 `reportToolCall`, `reportToolResult`）通知平台层工具的执行状态。
  - Console 平台的 View 模块独立维护 React 状态，根据组件树渲染聊天记录和工具卡片。
- **新增依赖**：`ink`, `react`, `ink-text-input`, `chalk` 以及相应的 `@types`。

## 二、步骤划分

1. **环境准备**
   - 修改 `tsconfig.json` 以支持 `jsx: "react-jsx"`。
   - 安装所需的 NPM 依赖。

2. **扩展核心接口**
   - 在 `PlatformAdapter` 中增加可选的钩子方法：`reportToolCall` 和 `reportToolResult`，并在 `sendMessageStream` 中支持分发状态。
   -在 `Orchestrator` 中，当执行工具时，如果平台实现了这些钩子，则调用它们，以便 TUI 能够实时显示“工具执行中...”和“执行结果”。

3. **构建 TUI 视图层 (React Components)**
   - `App.tsx`: 根组件，维护全局状态（消息列表、是否正在生成、输入框内容）。
   - `MessageList.tsx`: 渲染历史消息。
   - `InputArea.tsx`: 底部输入框（使用 `ink-text-input`）。
   - `ToolBlock.tsx`: 工具调用的外层容器。
   - `tools/*.tsx`: 针对特定工具的自定义渲染器（如 `read_file`, `terminal`, `search_replace`），当没有对应的渲染器时使用默认的 JSON 渲染。

4. **对接 ConsolePlatform 控制器**
   - 重写 `src/platforms/console/index.ts`。
   - 在 `start()` 中使用 `render(<App />)` 挂载视图。
   - 将 `sendMessage`, `sendMessageStream`, `reportToolCall`, `reportToolResult` 转化为触发视图状态更新的动作。
   - 当视图层发生 `onSubmit` 时，调用原有的 `messageHandler`。

5. **美化与细节优化**
   - 使用 `chalk` 或 `ink` 的 `<Text color="...">` 增加颜色标识（如错误用红色，代码块用灰色/青色）。
   - 在流式输出时实现打字机效果。
