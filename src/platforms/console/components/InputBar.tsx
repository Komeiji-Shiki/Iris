/**
 * 底部输入栏
 *
 * 使用 ink-text-input 接收用户输入。
 * 生成中时禁用输入。
 */

import { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputBarProps {
  disabled: boolean;
  onSubmit: (text: string) => void;
}

export function InputBar({ disabled, onSubmit }: InputBarProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  if (disabled) {
    return (
      <Box marginTop={0}>
        <Text color="gray">{'> '}</Text>
      </Box>  
    );
  }

  return (
    <Box marginTop={1}>
      <Text bold color="cyan">{'> '}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder="输入消息…"
      />
    </Box>
  );
}
