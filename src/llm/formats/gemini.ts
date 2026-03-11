/**
 * Gemini 格式适配器
 *
 * 内部格式就是 Gemini 格式，请求方向直通。
 * 响应方向从 candidates[0] 提取内容。
 */

import { LLMRequest, LLMResponse, LLMStreamChunk } from '../../types';
import { FormatAdapter, StreamDecodeState } from './types';

export class GeminiFormat implements FormatAdapter {

  /** 请求直通，但过滤内部字段 */
  encodeRequest(request: LLMRequest, _stream?: boolean): unknown {
    // 深拷贝请求并过滤内部字段
    return filterInternalFields(request);
  }

  /** 从 Gemini API 响应中提取 content、finishReason、usageMetadata */
  decodeResponse(raw: unknown): LLMResponse {
    const data = raw as any;
    const candidate = data.candidates?.[0];
    if (!candidate?.content) {
      throw new Error(`Gemini API 未返回有效内容: ${JSON.stringify(data)}`);
    }
    return {
      content: candidate.content,
      finishReason: candidate.finishReason,
      usageMetadata: data.usageMetadata,
    };
  }

  /** 流式块：从每个 SSE chunk 的 candidates 提取有序 parts / 可见文本 / functionCalls */
  decodeStreamChunk(raw: unknown, _state: StreamDecodeState): LLMStreamChunk {
    const data = raw as any;
    const candidate = data.candidates?.[0];
    const chunk: LLMStreamChunk = {};

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if ('text' in part) {
          if (!chunk.partsDelta) chunk.partsDelta = [];
          chunk.partsDelta.push(part);
          if (!part.thought) {
            chunk.textDelta = (chunk.textDelta ?? '') + part.text;
          }
        }
        if ('functionCall' in part) {
          if (!chunk.functionCalls) chunk.functionCalls = [];
          chunk.functionCalls.push(part);
          if (!chunk.partsDelta) chunk.partsDelta = [];
          chunk.partsDelta.push(part);
        }
        // 提取思考签名（Gemini thinking model 返回）
        if ('thoughtSignature' in part && !chunk.thoughtSignature) {
          chunk.thoughtSignature = part.thoughtSignature as string;
        }
      }
    }

    if (candidate?.finishReason) chunk.finishReason = candidate.finishReason;
    if (data.usageMetadata) chunk.usageMetadata = data.usageMetadata;

    return chunk;
  }

  /** Gemini 无跨 chunk 状态 */
  createStreamState(): StreamDecodeState {
    return {};
  }
}

/** 过滤内部字段，防止发送到外部 API */
function filterInternalFields(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(filterInternalFields);
  }

  // 处理对象
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // 跳过内部字段
    if (key === 'durationMs' || key === 'streamOutputDurationMs' || key === 'thoughtDurationMs' || key === 'usageMetadata') {
      continue;
    }
    // 递归处理嵌套对象
    result[key] = filterInternalFields(value);
  }
  return result;
}
