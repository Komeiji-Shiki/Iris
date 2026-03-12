/**
 * OCR 配置解析
 */

export interface OCRConfig {
  provider: 'openai-compatible';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const OCR_DEFAULTS: Omit<OCRConfig, 'provider' | 'apiKey'> = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
};

export function parseOCRConfig(raw: any): OCRConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }

  const provider = raw.provider ?? 'openai-compatible';
  if (provider !== 'openai-compatible') {
    throw new Error(`不支持的 OCR provider: ${String(provider)}`);
  }

  return {
    provider,
    apiKey: raw.apiKey ?? '',
    baseUrl: raw.baseUrl || OCR_DEFAULTS.baseUrl,
    model: raw.model || OCR_DEFAULTS.model,
  };
}
