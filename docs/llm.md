# LLM API 调用层

## 职责

LLM 层负责调用各个模型提供商的 HTTP API。Iris 不依赖官方 SDK，而是：

- 内部统一使用 Gemini 风格的消息格式
- 通过 `FormatAdapter` 进行 provider 双向转换
- 通过独立的 `transport.ts` / `response.ts` 处理传输与 SSE 解析

---

## 模块结构

```text
src/llm/
├── formats/
│   ├── types.ts                # FormatAdapter 接口定义
│   ├── gemini.ts               # Gemini 格式
│   ├── openai-compatible.ts    # OpenAI Chat Completions 兼容格式
│   ├── openai-responses.ts     # OpenAI Responses 格式
│   └── claude.ts               # Claude / Anthropic 格式
├── providers/
│   ├── base.ts                 # LLMProvider 组合器
│   ├── gemini.ts
│   ├── openai-compatible.ts
│   ├── openai-responses.ts
│   └── claude.ts
├── factory.ts                  # 按配置创建 provider / router
├── router.ts                   # 三层 LLM 路由
├── transport.ts                # 通用 fetch 发送
├── response.ts                 # 非流式 / 流式统一后处理
└── vision.ts                   # vision 能力判定（supportsVision / 模型名启发式）
```

---

## 内部统一格式

Iris 在模块之间传递的是统一 `Part` 结构，定义在 `src/types/message.ts`。

常见 part：

| 类型 | 结构 | 用途 |
|---|---|---|
| 文本 | `{ text: string }` | 普通文本 |
| 思考 | `{ text?: string, thought: true }` | 推理/思考片段 |
| 图片 | `{ inlineData: { mimeType, data } }` | 图片等二进制输入（base64） |
| 工具调用 | `{ functionCall: { name, args } }` | 模型发起工具调用 |
| 工具结果 | `{ functionResponse: { name, response } }` | 工具执行结果回传模型 |

也就是说，**图片在内部统一表示为 `inlineData`**，各 provider 再把它映射成各自的多模态请求格式。

---

## 核心接口

### FormatAdapter

```ts
interface FormatAdapter {
  encodeRequest(request: LLMRequest, stream?: boolean): unknown
  decodeResponse(raw: unknown): LLMResponse
  decodeStreamChunk(raw: unknown, state: StreamDecodeState): LLMStreamChunk
  createStreamState(): StreamDecodeState
}
```

职责：

- `encodeRequest`：把内部统一格式转成 provider 请求体
- `decodeResponse`：把 provider 非流式响应转回内部格式
- `decodeStreamChunk`：把 provider 流式 chunk 转回内部增量格式
- `createStreamState`：为流式累积状态提供容器

### EndpointConfig

```ts
interface EndpointConfig {
  url: string
  streamUrl?: string
  headers: Record<string, string>
}
```

### LLMProvider

```ts
class LLMProvider {
  constructor(format: FormatAdapter, endpoint: EndpointConfig, name?: string)
  chat(request: LLMRequest): Promise<LLMResponse>
  chatStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk>
}
```

---

## 数据流向

```text
LLMRequest（内部统一格式）
  │
  ▼
FormatAdapter.encodeRequest()
  │
  ▼
transport.sendRequest()
  │
  ├─ 非流式 → response.processResponse()      → FormatAdapter.decodeResponse()
  └─ 流式   → response.processStreamResponse() → SSE 解析 → FormatAdapter.decodeStreamChunk()
```

---

## Vision / 图片输入支持

### 能力判定

Iris 通过两种方式判断主模型是否支持图片输入：

1. `llm.primary.supportsVision` 显式声明
2. 若未声明，则由 `src/llm/vision.ts` 根据模型名启发式判断

推荐：

- 官方模型名可依赖自动判断
- 自定义模型别名 / 中转网关 / 本地模型建议显式设置 `supportsVision`

### 图片 part 的 provider 映射

| 内部格式 | Gemini | OpenAI Compatible | OpenAI Responses | Claude |
|---|---|---|---|---|
| `{ inlineData: { mimeType, data } }` | 原样直通 `inlineData` | `content[].{ type: "image_url", image_url: { url: "data:..." } }` | `content[].{ type: "input_image", image_url: "data:..." }` | `content[].{ type: "image", source: { type: "base64", media_type, data } }` |

### 文本 + 图片混合输入

当用户同一条消息里既有文字又有图片时：

- Gemini：内部格式直接携带多 part
- OpenAI Compatible：编码为同一条 `user` message 的 `content[]`
- OpenAI Responses：编码为同一条 `user` input item 的 `content[]`
- Claude：编码为同一条 `user` message 的 `content[]`

---

## OCR 回退（与 LLM 层的关系）

OCR 不在 provider 内部做，而是在 Backend 进入 LLM 前预处理：

- 主模型支持 vision：直接把 `inlineData` 发给主模型
- 主模型不支持 vision 且配置了 `ocr.yaml`：
  - 先调用 OCR 模型提取图片文字/内容
  - 再把 OCR 提取结果作为文本 part 发给主模型
- 主模型不支持 vision 且未配置 OCR：
  - 图片仍写入历史
  - 发给主模型的是占位提示文本

这样做的好处：

- 各 provider 的图片输入能力只需关心自己如何编码图片
- OCR 回退不污染 provider 逻辑
- 切换主模型能力时，历史图片仍可保留并在前端展示

---

## 三层 LLM 路由

`src/llm/router.ts` 定义了：

- `primary`：用户主对话
- `secondary`：工具循环后续轮次
- `light`：轻量辅助任务

回退链：

```text
light -> secondary -> primary
```

图片会话的一个额外约束：

- 如果当前请求历史中包含图片输入，Backend 会把工具循环后续轮次也固定到 `primary`
- 目的是避免 `secondary` 恰好是不支持 vision 的文本模型，导致后续轮次无法理解同一上下文里的图片

---

## 格式转换对照（补充）

### OpenAI Compatible

| 内部格式 | OpenAI 兼容格式 |
|---|---|
| `systemInstruction.parts[].text` | `messages[].role = "system"` |
| `Content{role:"user", parts:[{text}]}` | `{ role:"user", content:"..." }` |
| `Content{role:"user", parts:[{text},{inlineData}]}` | `{ role:"user", content:[{type:"text"...},{type:"image_url"...}] }` |
| `Content{role:"model", parts:[{functionCall}]}` | `{ role:"assistant", tool_calls:[...] }` |
| `Content{role:"user", parts:[{functionResponse}]}` | `{ role:"tool", tool_call_id:"...", content:"..." }` |

### Claude

| 内部格式 | Claude 格式 |
|---|---|
| `systemInstruction.parts[].text` | 顶层 `system` |
| `Content{role:"user", parts:[{text}]}` | `{ role:"user", content:"..." }` 或 text block |
| `Content{role:"user", parts:[{text},{inlineData}]}` | `{ role:"user", content:[{type:"text"...},{type:"image"...}] }` |
| `Content{role:"model", parts:[{functionCall}]}` | `{ role:"assistant", content:[{type:"tool_use"...}] }` |
| `Content{role:"user", parts:[{functionResponse}]}` | `{ role:"user", content:[{type:"tool_result"...}] }` |

---

## 新增渠道时的注意事项

如果你要新增一个支持图片输入的 provider，需要额外处理：

1. 在 `encodeRequest()` 中把内部 `inlineData` 映射为对应渠道的图片格式
2. 确认该渠道是否允许“文本 + 图片”混合出现在同一 message/item 中
3. 确认流式接口是否与非流式 URL 不同
4. 若渠道要求工具调用与消息体存在特殊顺序，也要一并编码

---

## 注意事项

- OpenAI / Claude 的 tool call 有 ID，内部统一格式没有，适配器需自行生成/匹配
- Gemini 流式使用独立 URL：`streamGenerateContent?alt=sse`
- OpenAI Compatible 流式工具参数会分片到达，需要在 `StreamDecodeState` 中累积
- Claude 的 `stop_reason` 中：`tool_use` 表示需要继续工具轮次，`end_turn` 表示正常结束
- `requestBody` 会在 provider 编码完成后做深合并，适合透传 provider 特有参数
