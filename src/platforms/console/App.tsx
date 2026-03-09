/**
 * TUI 根组件
 *
 * 维护全局状态（消息列表、流式文本、工具调用、生成状态），
 * 通过 onReady 回调向外部暴露命令式控制接口 (AppHandle)。
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text } from 'ink';
import { ToolInvocation } from '../../types';
import { MessageItem, ChatMessage } from './components/MessageItem';
import { InputBar } from './components/InputBar';
import { ToolCall } from './components/ToolCall';
import { StatusLine } from './components/StatusLine';

// ---- 命令式控制接口 ----

export interface AppHandle {
  /** 添加一条已完成的消息 */
  addMessage(role: 'user' | 'assistant', content: string): void;
  /** 开始流式输出 */
  startStream(): void;
  /** 追加流式文本片段 */
  pushStreamChunk(chunk: string): void;
  /** 结束流式输出，将累积文本提交为消息 */
  endStream(): void;
  /** 同步工具调用列表 */
  setToolInvocations(invocations: ToolInvocation[]): void;
  /** 设置生成状态 */
  setGenerating(generating: boolean): void;
  /** 清空所有消息 */
  clearMessages(): void;
}

interface AppProps {
  onReady: (handle: AppHandle) => void;
  onSubmit: (text: string) => void;
  onExit: () => void;
}

export function App({ onReady, onSubmit, onExit }: AppProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolInvocations, setToolInvocations] = useState<ToolInvocation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // 用 ref 跟踪流式文本，保证命令式 API 始终读到最新值
  const streamRef = useRef('');

  // 组件挂载时创建 AppHandle 并通知外部
  useEffect(() => {
    const handle: AppHandle = {
      addMessage(role, content) {
        setMessages(prev => [...prev, { role, content }]);
      },
      startStream() {
        setIsStreaming(true);
        streamRef.current = '';
        setStreamingText('');
      },
      pushStreamChunk(chunk) {
        streamRef.current += chunk;
        setStreamingText(streamRef.current);
      },
      endStream() {
        setIsStreaming(false);
        const text = streamRef.current;
        if (text) {
          setMessages(prev => [...prev, { role: 'assistant', content: text }]);
        }
        streamRef.current = '';
        setStreamingText('');
      },
      setToolInvocations(invocations) {
        setToolInvocations([...invocations]);
      },
      setGenerating(generating) {
        setIsGenerating(generating);
      },
      clearMessages() {
        setMessages([]);
        setToolInvocations([]);
        setStreamingText('');
        streamRef.current = '';
      },
    };
    onReady(handle);
  }, []); // 仅挂载时执行一次

  // 输入提交回调（内置命令在这里处理）
  const handleSubmit = useCallback((text: string) => {
    if (text === '/quit' || text === '/exit') {
      onExit();
      return;
    }
    if (text === '/clear') {
      setMessages([]);
      setToolInvocations([]);
      return;
    }
    if (text === '/help') {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '命令列表:\n  /quit  - 退出\n  /clear - 清空对话\n  /help  - 显示帮助',
      }]);
      return;
    }
    onSubmit(text);
  }, [onSubmit, onExit]);

  // 计算活跃工具数量
  const activeToolCount = toolInvocations.filter(
    i => !(['success', 'warning', 'error'] as string[]).includes(i.status),
  ).length;

  return (
    <Box flexDirection="column">
      {/* 顶部标题 */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">🌸 Iris AI</Text>
        <Text color="gray"> — 输入消息开始对话，/help 查看命令</Text>
      </Box>

      {/* 历史消息 */}
      {messages.map((msg, i) => (
        <MessageItem key={i} role={msg.role} content={msg.content} />
      ))}

      {/* 流式文本 */}
      {isStreaming && (
        <MessageItem role="assistant" content={streamingText} isStreaming />
      )}

      {/* 工具调用卡片 */}
      {toolInvocations.length > 0 && (
        <Box flexDirection="column">
          {toolInvocations.map(inv => (
            <ToolCall key={inv.id} invocation={inv} />
          ))}
        </Box>
      )}

      {/* 状态行 */}
      <StatusLine
        isGenerating={isGenerating}
        isStreaming={isStreaming}
        activeTools={activeToolCount}
        totalTools={toolInvocations.length}
      />

      {/* 输入栏 */}
      <InputBar
        disabled={isGenerating}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
