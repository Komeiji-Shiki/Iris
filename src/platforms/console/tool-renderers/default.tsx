/**
 * 默认工具结果渲染器
 *
 * 将结果 JSON 序列化后截断显示，作为未知工具的兆底渲染。
 */

import { Box, Text } from 'ink';

const MAX_LINES = 10;

/** 工具渲染器统一 Props */
export interface ToolRendererProps {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

export function DefaultRenderer({ result }: ToolRendererProps) {
  const text = typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2);

  const lines = text.split('\n');
  const truncated = lines.length > MAX_LINES;
  const display = truncated ? lines.slice(0, MAX_LINES).join('\n') : text;

  return (
    <Box flexDirection="column">
      <Text color="gray">{display}</Text>
      {truncated && (
        <Text color="gray">  … ({lines.length - MAX_LINES} 行已省略)</Text>
      )}
    </Box>
  );
}
