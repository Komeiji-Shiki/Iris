/**
 * MCP 配置解析
 */

import { MCPConfig, MCPServerConfig } from './types';
import { createLogger } from '../logger';

const logger = createLogger('MCPConfig');

const VALID_TRANSPORTS = ['stdio', 'sse', 'streamable-http', 'http'] as const;

function normalizeTransport(value: unknown): MCPServerConfig['transport'] | undefined {
  if (value === 'http') return 'streamable-http';
  if (value === 'stdio' || value === 'sse' || value === 'streamable-http') return value;
  return undefined;
}

export function parseMCPConfig(raw: any): MCPConfig | undefined {
  if (!raw || !raw.servers || typeof raw.servers !== 'object') return undefined;

  const servers: Record<string, MCPServerConfig> = {};

  for (const [name, cfg] of Object.entries(raw.servers)) {
    const c = cfg as any;
    if (!c || typeof c !== 'object') continue;

    const transport = normalizeTransport(c.transport);
    if (!transport) {
      logger.warn(`MCP 服务器 "${name}" 的 transport 无效（需为 stdio、sse、streamable-http；http 会映射为 streamable-http），已跳过`);
      continue;
    }

    if (transport === 'stdio' && !c.command) {
      logger.warn(`MCP 服务器 "${name}" 缺少 command 字段，已跳过`);
      continue;
    }

    if ((transport === 'sse' || transport === 'streamable-http') && !c.url) {
      logger.warn(`MCP 服务器 "${name}" 缺少 url 字段，已跳过`);
      continue;
    }

    servers[name] = {
      transport,
      command: c.command,
      args: Array.isArray(c.args) ? c.args.map(String) : undefined,
      env: c.env && typeof c.env === 'object' ? c.env : undefined,
      cwd: c.cwd,
      url: c.url,
      headers: c.headers && typeof c.headers === 'object' ? c.headers : undefined,
      timeout: typeof c.timeout === 'number' ? c.timeout : undefined,
      enabled: typeof c.enabled === 'boolean' ? c.enabled : undefined,
    };
  }

  if (Object.keys(servers).length === 0) return undefined;

  return { servers };
}
