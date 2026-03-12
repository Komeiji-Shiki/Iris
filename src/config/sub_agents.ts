/**
 * 子代理配置解析
 *
 * 从 sub_agents.yaml 解析子代理全局配置和类型定义。
 *
 * 配置示例：
 *   parallel: true
 *   types:
 *     general-purpose:
 *       description: "执行需要多步工具操作的复杂子任务"
 *       systemPrompt: "你是一个通用子代理..."
 *       excludedTools: [sub_agent]
 *       tier: secondary
 *       maxToolRounds: 200
 *     explore:
 *       description: "只读搜索和阅读文件"
 *       allowedTools: [read_file, terminal]
 *       tier: light
 *       maxToolRounds: 200
 */

import { SubAgentsConfig, SubAgentTypeDef } from './types';

const VALID_TIERS = new Set(['primary', 'secondary', 'light']);

export function parseSubAgentsConfig(raw: any): SubAgentsConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const config: SubAgentsConfig = {
    parallel: raw.parallel !== false,
  };

  if (raw.types && typeof raw.types === 'object' && !Array.isArray(raw.types)) {
    const types: SubAgentTypeDef[] = [];

    for (const [name, value] of Object.entries(raw.types)) {
      if (!value || typeof value !== 'object') continue;
      const cfg = value as Record<string, any>;

      types.push({
        name,
        description: typeof cfg.description === 'string' ? cfg.description : '',
        systemPrompt: typeof cfg.systemPrompt === 'string' ? cfg.systemPrompt : '',
        allowedTools: Array.isArray(cfg.allowedTools)
          ? cfg.allowedTools.filter((s: any) => typeof s === 'string')
          : undefined,
        excludedTools: Array.isArray(cfg.excludedTools)
          ? cfg.excludedTools.filter((s: any) => typeof s === 'string')
          : undefined,
        tier: typeof cfg.tier === 'string' && VALID_TIERS.has(cfg.tier) ? cfg.tier : 'secondary',
        maxToolRounds: typeof cfg.maxToolRounds === 'number' && cfg.maxToolRounds > 0
          ? cfg.maxToolRounds
          : 200,
      });
    }

    if (types.length > 0) {
      config.types = types;
    }
  }

  return config;
}
