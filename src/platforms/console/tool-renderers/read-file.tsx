/**
 * read_file 工具渲染器
 *
 * 显示文件路径、行范围和内容摘要。
 */

import { Box, Text } from 'ink';
import { ToolRendererProps } from './default';

const MAX_LINES = 20;

interface ReadFileResult {
  path?:string;
  totalLines?: number;
  startLine?: number;
  endLine?: number;
  content?: string;
}

export function ReadFileRenderer({ result }: ToolRendererProps) {
  const r = (result || {}) as ReadFileResult;

  const lines = (r.content || '').split('\n');
  const truncated = lines.length > MAX_LINES;
  const display = truncated ? lines.slice(0, MAX_LINES).join('\n') : (r.content || '');

  return (
    <Box flexDirection="column">
      <Text color="gray">
        {r.path} ({r.totalLines} 行，显示 {r.startLine}-{r.endLine})
      </Text>
      <Text color="gray">{display}</Text>
    {truncated && (
        <Text color="gray">  … ({lines.length - MAX_LINES} 行已省略)</Text>
      )}
    </Box>
  );
}
