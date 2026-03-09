# 工具注册层

## 职责

管理 LLM 可调用的工具。提供注册、执行、查询接口。

## 文件结构

```
src/tools/
├── registry.ts          ToolRegistry 工具注册中心
├── state.ts             ToolStateManager 工具状态管理器
└── builtin/
    ├── example.ts       内置示例工具
    ├── read-file.ts     文件读取工具
    ├── search-replace.ts搜索替换工具
    ├── apply-diff.ts    差异应用工具
    └── terminal.ts      终端执行工具
```

## ToolRegistry 接口

```typescript
class ToolRegistry {
  register(tool: ToolDefinition): void;        // 注册单个工具
  registerAll(tools: ToolDefinition[]): void;   // 批量注册
  unregister(name: string): boolean;            // 注销
  get(name: string): ToolDefinition | undefined;// 获取
  execute(name: string, args: Record<string, unknown>): Promise<unknown>; // 执行
  getDeclarations(): FunctionDeclaration[];     // 获取所有声明（供 LLM）
  listTools(): string[];                        // 列出工具名
  size: number;                                 // 工具数量
}
```

## ToolDefinition 格式

```typescript
interface ToolDefinition {
  declaration: FunctionDeclaration;  // 工具声明（供 LLM 识别）
  handler: ToolHandler;             // 执行器函数
}

interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: {                    // JSON Schema 格式
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required?: string[];
  };
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
```

## 工具状态管理

### 概述

`ToolStateManager` 独立于 `ToolRegistry`，专门管理工具调用实例的生命周期状态。

两者职责分离：
- `ToolRegistry` — 管理工具定义（注册、注销、声明查询、执行）
- `ToolStateManager` — 管理运行时状态（创建调用实例、状态转换、查询、事件通知）

### 8 种状态

| 状态                | 值                  | 说明                                           |
| ------------------- | ------------------- | ---------------------------------------------- |
| 生成中              | `streaming`         | AI 正在输出工具调用的参数（参数可能不完整）    |
| 排队中              | `queued`            | AI 输出完毕，工具在队列中等待执行              |
| 等待批准            | `awaiting_approval` | 工具需要用户手动批准才能执行（autoExec 为 false） |
| 执行中              | `executing`         | 工具的 handler 正在运行                        |
| 等待应用            | `awaiting_apply`    | 工具已生成变更预览，等待用户审阅并应用         |
| 成功                | `success`           | **终态**。执行成功                             |
| 警告                | `warning`           | **终态**。部分成功                             |
| 错误                | `error`             | **终态**。执行失败、超时、被取消或拒绝         |

### 状态流转

```
streaming ──→ queued ──→ awaiting_approval ──→ executing ──→ awaiting_apply ──→ success
                │              │                  │                └──→ warning
                │              │                  └──→ success / warning / error
                │              └──→ executing / error
                └──→ executing / error

（任何非终态均可直接转为 error）
```

### ToolStateManager 接口

```typescript
class ToolStateManager extends EventEmitter {
  // 创建
  create(toolName: string, args?: Record<string, unknown>, initialStatus?: ToolStatus): ToolInvocation;

  // 状态转换（自动校验合法性）
  transition(id: string, newStatus: ToolStatus, payload?: {
    result?: unknown;
    error?: string;
    args?: Record<string, unknown>;
  }): ToolInvocation;

  // 查询
  get(id: string): ToolInvocation | undefined;
  getByStatus(status: ToolStatus): ToolInvocation[];
  getActive(): ToolInvocation[];   // 所有非终态调用
  getAll(): ToolInvocation[];
  size: number;

  // 判断
  isTerminal(status: ToolStatus): boolean;
  hasActive(): boolean;

  // 清理
  clearCompleted(): number;  // 清除终态记录
  clearAll(): void;
}
```

### 事件

| 事件名        | 载荷                    | 触发时机                   |
| ------------- | ----------------------- | -------------------------- |
| `created`     | `ToolInvocation`        | 调用实例被创建时           |
| `stateChange` | `ToolStateChangeEvent`  | 每次状态转换后             |
| `completed`   | `ToolInvocation`        | 进入终态（success/warning/error）时 |

### ToolInvocation 数据结构

```typescript
interface ToolInvocation {
  id: string;                       // 调用唯一标识
  toolName: string;                 // 工具名称
  args: Record<string, unknown>;    // 调用参数
  status: ToolStatus;               // 当前状态
  result?: unknown;                 // 执行结果（终态 success/warning 时）
  error?: string;                   // 错误信息（终态 error 时）
  createdAt: number;             // 创建时间戳
  updatedAt: number;                // 最后状态更新时间戳
}
```

### 使用示例

```typescript
const toolState = new ToolStateManager();

// 监听状态变更
toolState.on('stateChange', ({ invocation, previousStatus }) => {
  console.log(`${invocation.toolName}: ${previousStatus} → ${invocation.status}`);
});

// 监听完成
toolState.on('completed', (invocation) => {
  console.log(`${invocation.toolName} 已完成: ${invocation.status}`);
});

// 创建 → 执行 → 成功
const inv = toolState.create('read_file', { path: 'foo.ts' });
toolState.transition(inv.id, 'executing');
toolState.transition(inv.id, 'success', { result: '文件内容...' });
```

## 新增工具步骤

1. 创建 `src/tools/builtin/工具名.ts`（或在其他目录）
2. 导出一个或多个 `ToolDefinition` 对象
3. 在 `src/index.ts` 中 import 并调用 `tools.register()` 或 `tools.registerAll()`

## 示例：创建一个新工具

```typescript
// src/tools/builtin/my_tool.ts
import { ToolDefinition } from '../../types';

export const myTool: ToolDefinition = {
  declaration: {
    name: 'my_tool',
    description: '这个工具做什么',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: '参数说明' },
      },
      required: ['param1'],
    },
  },
  handler: async (args) => {
    const param1 = args.param1 as string;
    // 执行逻辑
    return { result: '...' };
},
};
```

## 注意事项

- `handler` 必须是 async 函数
- `handler` 抛出的错误会被 Orchestrator 捕获，转为错误消息回传给 LLM
- 工具的返回值会被包装为 `{ result: 返回值 }` 放入 functionResponse.response
- 状态转换会自动校验合法性，非法转换会抛出错误
- `ToolStateManager` 通过 EventEmitter 通知外部（如 UI 层）状态变化
