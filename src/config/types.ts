/**
 * 配置类型定义
 */

export interface LLMConfig {
  provider: 'gemini' | 'openai-compatible' | 'claude';
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface PlatformConfig {
  type: 'console' | 'discord' | 'telegram' | 'web';
  discord: { token: string };
  telegram: { token: string };
  web: { port: number; host: string };
}

export interface StorageConfig {
  type: 'json-file' | 'sqlite';
  dir: string;
  dbPath?: string;
}

export interface SystemConfig {
  systemPrompt: string;
  maxToolRounds: number;
  stream: boolean;
}

export interface MemoryConfig {
  /** 是否启用记忆，默认 false */
  enabled: boolean;
  /** 数据库路径，默认 ./data/memory.db */
  dbPath?: string;
}

export interface CloudflareConfig {
  apiToken: string;
  zoneId: string;
}

export interface AppConfig {
  llm: LLMConfig;
  platform: PlatformConfig;
  storage: StorageConfig;
  system: SystemConfig;
  memory?: MemoryConfig;
  cloudflare?: CloudflareConfig;
}
