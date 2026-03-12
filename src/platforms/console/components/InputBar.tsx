/**
 * 底部输入栏
 *
 * 输入 / 时在下方显示可用指令列表，输入更多字符时按前缀过滤。
 * 支持 Tab 自动补全和切换，支持上下箭头切换选中指令。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

/** 指令定义 */
export interface Command {
  name: string;
  description: string;
}

/** 内置指令列表 */
export const COMMANDS: Command[] = [
  { name: '/new',      description: '新建对话' },
  { name: '/load',     description: '加载历史对话' },
  { name: '/settings', description: '打开设置中心（LLM / System / MCP）' },
  { name: '/mcp',      description: '直接打开 MCP 管理区' },
  { name: '/sh',       description: '执行命令（如 cd、dir、git 等）' },
  { name: '/exit',     description: '退出应用' },
];

interface InputBarProps {
  disabled: boolean;
  onSubmit: (text: string) => void;
}

function getCommandInput(cmd: Command): string {
  return cmd.name === '/sh' ? '/sh ' : cmd.name;
}

function isExactCommandValue(value: string, cmd: Command): boolean {
  return value === cmd.name || value === getCommandInput(cmd);
}

export function InputBar({ disabled, onSubmit }: InputBarProps) {
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const exactMatchIndex = useMemo(() => {
    return COMMANDS.findIndex(cmd => isExactCommandValue(value, cmd));
  }, [value]);

  const commandQuery = useMemo(() => {
    if (disabled) return '';
    if (!value.startsWith('/')) return '';
    if (/\s/.test(value) && exactMatchIndex < 0) return '';
    return value;
  }, [disabled, value, exactMatchIndex]);

  const showCommands = commandQuery.length > 0;

  const filtered = useMemo(() => {
    if (!showCommands) return [];
    if (exactMatchIndex >= 0) return COMMANDS;
    return COMMANDS.filter(cmd => cmd.name.startsWith(commandQuery.trim()));
  }, [showCommands, exactMatchIndex, commandQuery]);

  useEffect(() => {
    if (!showCommands || filtered.length === 0) {
      setSelectedIndex(0);
      return;
    }

    if (exactMatchIndex >= 0) {
      setSelectedIndex(exactMatchIndex);
      return;
    }

    setSelectedIndex(prev => Math.min(prev, filtered.length - 1));
  }, [showCommands, filtered.length, exactMatchIndex]);

  const handleSubmit = (text: string) => {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
    setSelectedIndex(0);
  };

  const applySelection = (index: number) => {
    if (filtered.length === 0) return;
    const normalizedIndex = ((index % filtered.length) + filtered.length) % filtered.length;
    const cmd = filtered[normalizedIndex];
    setSelectedIndex(normalizedIndex);
    setValue(getCommandInput(cmd));
  };

  useInput((input, key) => {
    if (disabled || !showCommands || filtered.length === 0) return;

    if (key.upArrow) {
      applySelection(selectedIndex - 1);
      return;
    }

    if (key.downArrow) {
      applySelection(selectedIndex + 1);
      return;
    }

    if (key.tab || input === '\t') {
      const current = filtered[selectedIndex];
      if (!current) return;

      if (isExactCommandValue(value, current)) {
        applySelection(selectedIndex + 1);
      } else {
        applySelection(selectedIndex);
      }
    }
  });

  const maxLen = filtered.length > 0
    ? Math.max(...filtered.map(cmd => cmd.name.length))
    : 0;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" alignSelf="flex-start">
        <Text color={disabled ? 'gray' : 'cyan'} bold>{"\u276F"} </Text>
        <TextInput
          value={value}
          onChange={(nextValue) => {
            const nextExactIndex = COMMANDS.findIndex(cmd => isExactCommandValue(nextValue, cmd));
            setValue(nextValue);

            if (!nextValue.startsWith('/')) {
              setSelectedIndex(0);
              return;
            }

            if (/\s/.test(nextValue) && nextExactIndex < 0) {
              setSelectedIndex(0);
              return;
            }

            const nextFiltered = COMMANDS.filter(cmd => cmd.name.startsWith(nextValue.trim()));
            if (nextFiltered.length === 0) {
              setSelectedIndex(0);
              return;
            }

            if (nextExactIndex >= 0) {
              setSelectedIndex(nextExactIndex);
            } else {
              setSelectedIndex(0);
            }
          }}
          onSubmit={handleSubmit}
          placeholder=""
        />
      </Box>
      {filtered.length > 0 && (
        <Box flexDirection="column" paddingLeft={1}>
          {filtered.map((cmd, index) => {
            const padded = cmd.name.padEnd(maxLen);
            const isSelected = index === selectedIndex;
            return (
              <Text key={cmd.name}>
                <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '>' : ' '}</Text>
                <Text> </Text>
                <Text color={isSelected ? 'cyan' : 'white'}>{padded}</Text>
                <Text dimColor>  {cmd.description}</Text>
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
