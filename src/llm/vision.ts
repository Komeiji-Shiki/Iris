/**
 * Vision 能力检测
 */

import type { LLMConfig } from '../config/types';

const VISION_PATTERNS = [
  /gpt-4o/i,
  /gpt-4\.1/i,
  /gpt-4-turbo/i,
  /gemini/i,
  /claude-3/i,
  /claude-sonnet-4/i,
  /claude-opus-4/i,
  /qwen.*vl/i,
  /glm-4v/i,
  /minicpm-v/i,
  /pixtral/i,
  /llava/i,
  /(?:^|[-_/])vision(?:[-_/]|$)/i,
];

export function supportsVision(config?: Pick<LLMConfig, 'model' | 'supportsVision'>): boolean {
  if (!config) return false;
  if (typeof config.supportsVision === 'boolean') {
    return config.supportsVision;
  }
  return VISION_PATTERNS.some((pattern) => pattern.test(config.model ?? ''));
}
