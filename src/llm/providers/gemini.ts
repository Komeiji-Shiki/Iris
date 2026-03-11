/**
 * Gemini Provider
 */

import { LLMProvider } from './base';
import { GeminiFormat } from '../formats/gemini';

export interface GeminiProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  requestBody?: Record<string, unknown>;
}

export function createGeminiProvider(config: GeminiProviderConfig): LLMProvider {
  const model = config.model || 'gemini-2.0-flash';
  const baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const key = config.apiKey;

  return new LLMProvider(
    new GeminiFormat(),
    {
      url: `${baseUrl}/models/${model}:generateContent`,
      streamUrl: `${baseUrl}/models/${model}:streamGenerateContent?alt=sse`,
      headers: { 'x-goog-api-key': key, ...config.headers },
    },
    'Gemini',
    config.requestBody,
  );
}
