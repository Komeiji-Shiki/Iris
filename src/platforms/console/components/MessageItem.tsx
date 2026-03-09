/**
 * 单条消息渲染
 *
 * 区分 user / assistant 角色，使用不同颜色前缀。
 */

import { Box, Text } from 'ink';

/** 聊天消息数据结构 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MessageItemProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export function MessageItem({ role, content, isStreaming }: MessageItemProps) {
  const isUser = role === 'user';

  return (
    <Box marginBottom={0} flexDirection="column">
      <Text wrap="wrap">
        <Text bold color={isUser ? 'blue' : 'green'}>
          {isUser ? 'You' : 'AI'}:{' '}
        </Text>
        {content}
        {isStreaming && <Text color="gray">▊</Text>}
      </Text>
    </Box>
  );
}
