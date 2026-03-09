/**
 * apply_diff 工具渲染器
 *
 * 显示文件路径、hunk 应用统计和失败详情。
 */

import { Box, Text } from 'ink';
import { ToolRendererProps } from './default';

interface ApplyDiffResult {
  path?: string;
  totalHunks?: number;
  applied?: number;
  failed?: number;
  results?: Array<{ index: number; success: boolean; matchedLine?: number; error?: string }>;
}

export function ApplyDiffRenderer({ result }: ToolRendererProps) {
  const r = (result || {}) as ApplyDiffResult;
  const allSuccess = (r.failed ?? 0) === 0;

  return (
  <Box flexDirection="column">
      <Text color={allSuccess ? 'green' : 'yellow'}>
        {r.path}: {r.applied}/{r.totalHunks} 个 hunk 已应用
        {(r.failed ?? 0) > 0 ? <Text color="red">，{r.failed} 个失败</Text> : null}
      </Text>
      {(r.results || []).filter(res => !res.success).map((res, i) => (
        <Text key={i} color="red">  hunk {res.index}: {res.error}</Text>
      ))}
    </Box>
  );
}
