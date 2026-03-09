/**
 * 状态行
 *
 * 显示当前系统状态：思考中 / 回复中 / 执行工具。
 * 空闲时不显示。
 */

import { Box, Text } from 'ink';
import { Spinner } from './Spinner';

interface StatusLineProps {
  isGenerating: boolean;
  isStreaming: boolean;
  activeTools: number;
  totalTools: number;
}

export function StatusLine({ isGenerating, isStreaming, activeTools, totalTools }: StatusLineProps) {
  if (!isGenerating) {
    return null;
  }

  let statusText: string;
  if (activeTools > 0) {
    const done = totalTools - activeTools;
    statusText = `执行工具 ${done + 1}/${totalTools}…`;
  } else if (isStreaming) {
    statusText = '回复中';
  } else {
    statusText = 'AI 正在思考…';
  }

  return (
    <Box marginTop={0}>
      <Spinner />
      <Text color="yellow"> {statusText}</Text>
    </Box>
  );
}
