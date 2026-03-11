/**
 * OpenAI Responses Provider
 * 
 * 组装 OpenAI Responses 格式适配器与 HTTP 传输逻辑。
 */

import { LLMProvider } from './base';
import { OpenAIResponsesFormat } from '../formats/openai-responses';

export interface OpenAIResponsesProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  requestBody?: Record<string, unknown>;
}

export function createOpenAIResponsesProvider(config: OpenAIResponsesProviderConfig): LLMProvider {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  // OpenAI Responses API 路径
  const url = `${baseUrl}/responses`;

  return new LLMProvider(
    new OpenAIResponsesFormat(config.model),
    {
      url,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        ...config.headers,
      },
    },
    `OpenAIResponses(${config.model})`,
    config.requestBody,
  );
}
