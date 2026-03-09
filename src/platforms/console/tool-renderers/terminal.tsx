/**
 * terminal 工具渲染器
 *
 * 显示退出码、stdout、stderr。
 */

import { Box, Text } from 'ink';
import { ToolRendererProps } from './default';

const MAX_OUTPUT_LINES = 15;

interface TerminalResult {
  command?: string;
  exitCode?: number;
  killed?: boolean;
  stdout?: string;
  stderr?: string;
}

function truncateText(text: string, max: number): { display: string; truncated: boolean } {
  if (!text) return { display: '', truncated: false };
  const lines = text.split('\n');
  if (lines.length <= max) return { display: text, truncated: false };
  return { display: lines.slice(0, max).join('\n'), truncated: true };
}

export function TerminalRenderer({ result }: ToolRendererProps) {
  const r = (result || {}) as TerminalResult;
  const exitCode = r.exitCode ?? 0;
  const exitColor = exitCode === 0 ? 'green' : 'red';

  const stdout = truncateText(r.stdout || '', MAX_OUTPUT_LINES);
  const stderr = truncateText(r.stderr || '', MAX_OUTPUT_LINES);

  return (
    <Box flexDirection="column">
    <Text color={exitColor}>
        退出码: {exitCode}{r.killed ? ' (超时终止)' : ''}
      </Text>

  {stdout.display.length> 0 && (
        <Box flexDirection="column">
          <Text color="gray">{stdout.display}</Text>
          {stdout.truncated && <Text color="gray">  …(输出已截断)</Text>}
        </Box>
      )}

      {stderr.display.length> 0 && (
        <Box flexDirection="column">
          <Text color="yellow">stderr:</Text>
          <Text color="yellow">{stderr.display}</Text>
          {stderr.truncated && <Text color="yellow">  … (输出已截断)</Text>}
        </Box>
      )}
    </Box>
  );
}
