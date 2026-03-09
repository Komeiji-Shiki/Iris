/**
 * 工具调用卡片
 *
 * 根据 ToolInvocation.status 渲染不同 UI：
 *   streaming / queued       → ┃ ⏳ tool_name args…
 *   awaiting_approval        → ┃ ⚠ tool_name 等待批准
 *   executing                → ┃ ⠋ tool_name 执行中…
 *   awaiting_apply           → ┃ 📋 tool_name 等待应用
 *   success                  → ┃ ✓ tool_name + 结果
 *   warning                  → ┃ ⚠ tool_name + 结果
 *   error                    → ┃ ✗ tool_name + 错误信息
 *
 * 终态结果部分委托给 tool-renderers 中对应的渲染器。
 */

import { Box, Text } from 'ink';
import { Spinner } from './Spinner';
import { ToolInvocation, ToolStatus } from '../../../types';
import { getToolRenderer } from '../tool-renderers';

interface ToolCallProps {
  invocation: ToolInvocation;
}

// ---- 状态 → 显示配置 ----

interface StatusConfig {
  icon: string;
  color: string;
  label: string;
  useSpinner?: boolean;
}

const STATUS_MAP: Record<ToolStatus, StatusConfig> = {
  streaming:         { icon: '⏳', color: 'yellow', label: '参数生成中…' },
  queued:            { icon: '⏳', color: 'gray',   label: '排队中' },
  awaiting_approval: { icon: '⚠',  color: 'yellow', label: '等待批准' },
  executing:         { icon: '',   color: 'cyan',   label: '执行中…', useSpinner: true },
  awaiting_apply:    { icon: '📋', color: 'yellow', label: '等待应用' },
  success:           { icon: '✓',  color: 'green',  label: '' },
  warning:           { icon: '⚠',  color: 'yellow', label: '' },
  error:             { icon: '✗',  color: 'red',    label: '' },
};

const TERMINAL_STATUSES = new Set<ToolStatus>(['success', 'warning', 'error']);

// ---- 参数摘要 ----

function getArgsSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'terminal': {
      const cmd = String(args.command || '');
      return cmd.length > 60 ? `$ ${cmd.slice(0, 60)}…` : `$ ${cmd}`;
    }
    case 'read_file': {
      let s = String(args.path || '');
      if (args.startLine || args.endLine) {
        s += ` (L${args.startLine || 1}`;
        if (args.endLine) s += `-L${args.endLine}`;
        s += ')';
      }
      return s;
    }
    case 'apply_diff':
      return String(args.path || '');
    case 'search_replace': {
      let s = String(args.path || '');
      if (args.search) {
        const q = String(args.search);
        s += ` "${q.length > 30 ? q.slice(0, 30) + '…' : q}"`;
      }
      return s;
   }
    default: {
      const keys = Object.keys(args);
      if (keys.length === 0) return '';
      return `(${keys.join(', ')})`;
    }
  }
}

// ---- 组件 ----

export function ToolCall({ invocation }: ToolCallProps) {
  const { toolName, status, args, result, error } = invocation;
  const cfg = STATUS_MAP[status];

  const argsSummary = getArgsSummary(toolName, args);
  const isTerminal = TERMINAL_STATUSES.has(status);
  const Renderer = isTerminal && result != null ? getToolRenderer(toolName) : null;

  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* 状态行 */}
      <Text>
        <Text color="gray">┃ </Text>
        {cfg.useSpinner ? <Spinner /> : <Text color={cfg.color}>{cfg.icon}</Text>}
        <Text> </Text>
        <Text bold color={cfg.color}>{toolName}</Text>
        {argsSummary ? <Text color="gray"> {argsSummary}</Text> : null}
        {cfg.label ? <Text color={cfg.color}> {cfg.label}</Text> : null}
        {status === 'error' && error ? <Text color="red"> {error}</Text> : null}
      </Text>

      {/* 结果区域 */}
      {Renderer && result != null && (
        <Box marginLeft={4}>
          <Renderer toolName={toolName} args={args} result={result} />
        </Box>
      )}
    </Box>
  );
}
