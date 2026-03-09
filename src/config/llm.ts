/**
 * LLM 配置解析
 */

import { LLMConfig } from './types';

const DEFAULTS: Record<string, Partial<LLMConfig>> = {
  'gemini': {
    model: 'gemini-2.0-flash',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  'openai-compatible': {
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com',
  },
  'claude': {
    model: 'claude-sonnet-4-6',
    baseUrl: 'https://api.anthropic.com',
  },
};

export function parseLLMConfig(raw: any = {}): LLMConfig {
  const provider = (raw.provider ?? 'gemini') as LLMConfig['provider'];
  const defaults = DEFAULTS[provider] ?? {};

  return {
    provider,
    apiKey: raw.apiKey ?? '',
    model: raw.model ?? defaults.model ?? '',
    baseUrl: raw.baseUrl ?? defaults.baseUrl ?? '',
  };
}
