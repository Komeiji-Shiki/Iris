/**
 * Console 设置中心的数据模型与控制器
 */

import { Backend } from '../../core/backend';
import { DEFAULTS, parseTieredLLMConfig } from '../../config/llm';
import { parseSystemConfig } from '../../config/system';
import { LLMConfig } from '../../config/types';
import { isMasked, readEditableConfig, updateEditableConfig } from '../../config/manage';
import { applyRuntimeConfigReload } from '../../config/runtime';
import { MCPManager, MCPServerInfo } from '../../mcp';

export const CONSOLE_LLM_PROVIDER_OPTIONS = [
  'gemini',
  'openai-compatible',
  'openai-responses',
  'claude',
] as const;

export const CONSOLE_MCP_TRANSPORT_OPTIONS = [
  'stdio',
  'sse',
  'streamable-http',
] as const;

export type ConsoleLLMProvider = typeof CONSOLE_LLM_PROVIDER_OPTIONS[number];
export type ConsoleMCPTransport = typeof CONSOLE_MCP_TRANSPORT_OPTIONS[number];
export type ConsoleTierName = 'primary' | 'secondary' | 'light';

export interface ConsoleTierSettings {
  provider: ConsoleLLMProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface ConsoleMCPServerSettings {
  name: string;
  originalName?: string;
  transport: ConsoleMCPTransport;
  command: string;
  args: string;
  cwd: string;
  url: string;
  authHeader: string;
  timeout: number;
  enabled: boolean;
}

export interface ConsoleSettingsSnapshot {
  tiers: {
    primary: ConsoleTierSettings;
    secondary: ConsoleTierSettings;
    light: ConsoleTierSettings;
  };
  tierEnabled: {
    secondary: boolean;
    light: boolean;
  };
  system: {
    systemPrompt: string;
    maxToolRounds: number;
    stream: boolean;
  };
  tools: string[];
  mcpServers: ConsoleMCPServerSettings[];
  mcpStatus: MCPServerInfo[];
  mcpOriginalNames: string[];
}

export interface ConsoleSettingsSaveResult {
  ok: boolean;
  restartRequired: boolean;
  message: string;
  snapshot?: ConsoleSettingsSnapshot;
}

interface ConsoleSettingsControllerOptions {
  backend: Backend;
  configDir: string;
  getMCPManager(): MCPManager | undefined;
  setMCPManager(manager?: MCPManager): void;
}

function normalizeTransport(value: unknown): ConsoleMCPTransport {
  if (value === 'sse' || value === 'streamable-http') return value;
  if (value === 'http') return 'streamable-http';
  return 'stdio';
}

function sanitizeServerName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function createEmptyTier(provider: ConsoleLLMProvider = 'gemini'): ConsoleTierSettings {
  const defaults = DEFAULTS[provider] ?? DEFAULTS.gemini;
  return {
    provider,
    apiKey: '',
    model: defaults.model ?? '',
    baseUrl: defaults.baseUrl ?? '',
  };
}

export function applyTierProviderChange(
  tier: ConsoleTierSettings,
  nextProvider: ConsoleLLMProvider,
): ConsoleTierSettings {
  const oldDefaults = DEFAULTS[tier.provider] ?? {};
  const newDefaults = DEFAULTS[nextProvider] ?? {};

  return {
    provider: nextProvider,
    apiKey: tier.apiKey.startsWith('****') ? '' : tier.apiKey,
    model: !tier.model || tier.model === oldDefaults.model
      ? newDefaults.model ?? tier.model
      : tier.model,
    baseUrl: !tier.baseUrl || tier.baseUrl === oldDefaults.baseUrl
      ? newDefaults.baseUrl ?? tier.baseUrl
      : tier.baseUrl,
  };
}

export function createDefaultMCPServerEntry(): ConsoleMCPServerSettings {
  return {
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    cwd: '',
    url: '',
    authHeader: '',
    timeout: 30000,
    enabled: true,
  };
}

export function cloneConsoleSettingsSnapshot(snapshot: ConsoleSettingsSnapshot): ConsoleSettingsSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ConsoleSettingsSnapshot;
}

function buildTierPayload(tier: ConsoleTierSettings): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    provider: tier.provider,
    model: tier.model,
    baseUrl: tier.baseUrl,
  };

  if (tier.apiKey && !tier.apiKey.startsWith('****')) {
    payload.apiKey = tier.apiKey;
  }

  return payload;
}

function validateSnapshot(snapshot: ConsoleSettingsSnapshot): string | null {
  if (!Number.isFinite(snapshot.system.maxToolRounds) || snapshot.system.maxToolRounds < 1 || snapshot.system.maxToolRounds > 2000) {
    return '工具最大轮次必须在 1 到 2000 之间';
  }

  const names = new Set<string>();

  for (const server of snapshot.mcpServers) {
    const trimmedName = server.name.trim();
    const safeName = sanitizeServerName(trimmedName);

    if (!trimmedName) {
      return 'MCP 服务器名称不能为空';
    }

    if (safeName !== trimmedName) {
      return `MCP 服务器名称 "${trimmedName}" 仅支持字母、数字和下划线`;
    }

    if (names.has(trimmedName)) {
      return `MCP 服务器名称 "${trimmedName}" 重复`;
    }
    names.add(trimmedName);

    if (!Number.isFinite(server.timeout) || server.timeout < 1000 || server.timeout > 120000) {
      return `MCP 服务器 "${trimmedName}" 的超时必须在 1000 到 120000 毫秒之间`;
    }

    if (server.transport === 'stdio' && !server.command.trim()) {
      return `MCP 服务器 "${trimmedName}" 缺少 command`;
    }

    if (server.transport !== 'stdio' && !server.url.trim()) {
      return `MCP 服务器 "${trimmedName}" 缺少 url`;
    }
  }

  return null;
}

function buildMCPPayload(snapshot: ConsoleSettingsSnapshot): { servers: Record<string, any> } | null {
  const servers: Record<string, any> = {};

  for (const originalName of snapshot.mcpOriginalNames) {
    if (!snapshot.mcpServers.some(server => server.name.trim() === originalName)) {
      servers[originalName] = null;
    }
  }

  for (const server of snapshot.mcpServers) {
    const name = sanitizeServerName(server.name.trim());
    if (!name) continue;

    if (server.originalName && server.originalName !== name) {
      servers[server.originalName] = null;
    }

    const entry: Record<string, unknown> = {
      transport: server.transport,
      enabled: server.enabled,
      timeout: server.timeout || 30000,
    };

    if (server.transport === 'stdio') {
      entry.command = server.command.trim();
      entry.args = server.args
        .split(/\r?\n/g)
        .map(arg => arg.trim())
        .filter(Boolean);
      entry.cwd = server.cwd.trim() ? server.cwd.trim() : null;
    } else {
      entry.url = server.url.trim();
      if (server.authHeader.trim() && !isMasked(server.authHeader.trim())) {
        entry.headers = { Authorization: server.authHeader.trim() };
      } else if (!server.authHeader.trim()) {
        entry.headers = null;
      }
    }

    servers[name] = entry;
  }

  return Object.keys(servers).length > 0 ? { servers } : null;
}

export class ConsoleSettingsController {
  private backend: Backend;
  private configDir: string;
  private getMCPManager: () => MCPManager | undefined;
  private setMCPManager: (manager?: MCPManager) => void;

  constructor(options: ConsoleSettingsControllerOptions) {
    this.backend = options.backend;
    this.configDir = options.configDir;
    this.getMCPManager = options.getMCPManager;
    this.setMCPManager = options.setMCPManager;
  }

  async loadSnapshot(): Promise<ConsoleSettingsSnapshot> {
    const data = readEditableConfig(this.configDir);
    const llm = parseTieredLLMConfig(data.llm);
    const system = parseSystemConfig(data.system);
    const rawMcpServers = data.mcp?.servers && typeof data.mcp.servers === 'object'
      ? data.mcp.servers as Record<string, any>
      : {};

    return {
      tiers: {
        primary: {
          provider: llm.primary.provider,
          apiKey: llm.primary.apiKey,
          model: llm.primary.model,
          baseUrl: llm.primary.baseUrl,
        },
        secondary: llm.secondary
          ? {
            provider: llm.secondary.provider,
            apiKey: llm.secondary.apiKey,
            model: llm.secondary.model,
            baseUrl: llm.secondary.baseUrl,
          }
          : createEmptyTier(),
        light: llm.light
          ? {
            provider: llm.light.provider,
            apiKey: llm.light.apiKey,
            model: llm.light.model,
            baseUrl: llm.light.baseUrl,
          }
          : createEmptyTier(),
      },
      tierEnabled: {
        secondary: !!data.llm?.secondary,
        light: !!data.llm?.light,
      },
      system: {
        systemPrompt: system.systemPrompt,
        maxToolRounds: system.maxToolRounds,
        stream: system.stream,
      },
      tools: this.backend.getToolNames().sort((a, b) => a.localeCompare(b, 'zh-CN')),
      mcpServers: Object.entries(rawMcpServers).map(([name, cfg]) => ({
        name,
        originalName: name,
        transport: normalizeTransport(cfg?.transport),
        command: cfg?.command ? String(cfg.command) : '',
        args: Array.isArray(cfg?.args) ? cfg.args.map((arg: unknown) => String(arg)).join('\n') : '',
        cwd: cfg?.cwd ? String(cfg.cwd) : '',
        url: cfg?.url ? String(cfg.url) : '',
        authHeader: cfg?.headers?.Authorization ? String(cfg.headers.Authorization) : '',
        timeout: typeof cfg?.timeout === 'number' ? cfg.timeout : 30000,
        enabled: cfg?.enabled !== false,
      })),
      mcpStatus: this.getMCPManager()?.getServerInfo() ?? [],
      mcpOriginalNames: Object.keys(rawMcpServers),
    };
  }

  async saveSnapshot(snapshot: ConsoleSettingsSnapshot): Promise<ConsoleSettingsSaveResult> {
    const draft = cloneConsoleSettingsSnapshot(snapshot);

    const validationError = validateSnapshot(draft);
    if (validationError) {
      return {
        ok: false,
        restartRequired: false,
        message: validationError,
      };
    }

    const updates: Record<string, any> = {
      llm: {
        primary: buildTierPayload(draft.tiers.primary),
        secondary: draft.tierEnabled.secondary ? buildTierPayload(draft.tiers.secondary) : null,
        light: draft.tierEnabled.light ? buildTierPayload(draft.tiers.light) : null,
      },
      system: {
        systemPrompt: draft.system.systemPrompt,
        maxToolRounds: draft.system.maxToolRounds,
        stream: draft.system.stream,
      },
      mcp: buildMCPPayload(draft),
    };

    let mergedRaw: any;
    try {
      ({ mergedRaw } = updateEditableConfig(this.configDir, updates));
    } catch (err: unknown) {
      return {
        ok: false,
        restartRequired: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    let restartRequired = false;
    let message = '已保存并生效';

    try {
      await applyRuntimeConfigReload(
        {
          backend: this.backend,
          getMCPManager: this.getMCPManager,
          setMCPManager: this.setMCPManager,
        },
        mergedRaw,
      );
    } catch (err: unknown) {
      restartRequired = true;
      const detail = err instanceof Error ? err.message : String(err);
      message = `已保存，需要重启生效：${detail}`;
    }

    try {
      const refreshed = await this.loadSnapshot();
      return {
        ok: true,
        restartRequired,
        message,
        snapshot: refreshed,
      };
    } catch (err: unknown) {
      return {
        ok: true,
        restartRequired: true,
        message: `已保存，但刷新设置视图失败：${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
