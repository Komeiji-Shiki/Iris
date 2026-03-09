/**
 * search_replace 工具渲染器
 *
 * 搜索模式：列出匹配行。
 * 替换模式：显示匹配数和替换结果。
 */

import { Box, Text } from 'ink';
import { ToolRendererProps } from './default';

const MAX_MATCHES = 10;

interface SearchReplaceResult {
  path?: string;
  mode?: 'search' | 'replace';
  matchCount?: number;
  replaced?: boolean;
  matches?: Array<{ line: number; content: string }>;
}

export function SearchReplaceRenderer({ result }: ToolRendererProps) {
  const r = (result || {}) as SearchReplaceResult;

  if (r.mode === 'replace') {
    return (
      <Text color={r.replaced ? 'green' : 'yellow'}>
        {r.path}: {r.matchCount} 处匹配{r.replaced ? '，已替换' : '，未改变'}
      </Text>
    );
  }

  // 搜索模式
  const matches = r.matches || [];
  const display = matches.slice(0, MAX_MATCHES);

  return (
    <Box flexDirection="column">
      <Text color="gray">{r.path}: {r.matchCount} 处匹配</Text>
      {display.map((m, i) => (
        <Text key={i} color="gray">  L{m.line}: {m.content}</Text>
      ))}
      {matches.length > MAX_MATCHES && (
        <Text color="gray">  … ({matches.length - MAX_MATCHES} 条已省略)</Text>
      )}
    </Box>
  );
}
