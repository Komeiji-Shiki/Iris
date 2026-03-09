/**
 * 工具渲染器注册表
 *
 * 根据工具名称返回对应的渲染组件。
 * 未注册的工具回退到 DefaultRenderer。
 */

import type { FC } from 'react';
import type { ToolRendererProps } from './default';
import { DefaultRenderer } from './default';
import { TerminalRenderer } from './terminal';
import { ReadFileRenderer } from './read-file';
import { ApplyDiffRenderer } from './apply-diff';
import{ SearchReplaceRenderer } from './search-replace';

const renderers: Record<string, FC<ToolRendererProps>> = {
  terminal: TerminalRenderer,
  read_file: ReadFileRenderer,
  apply_diff: ApplyDiffRenderer,
  search_replace: SearchReplaceRenderer,
};

export function getToolRenderer(toolName: string): FC<ToolRendererProps> {
  return renderers[toolName] ?? DefaultRenderer;
}

export type { ToolRendererProps };
