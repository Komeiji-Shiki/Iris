/**
 * Console 平台适配器（基于 Ink TUI）
 *
 * 通过 ink + React 渲染终端界面，替代原有的 readline 纯文本输出。
 * 监听 ToolStateManager 事件，实时同步工具执行状态到界面。
 *
 * 职责分离：
 *   - 本类仅作为“控制器”，将核心层事件转换为 UI 状态更新
 *   - App.tsx 及其子组件负责渲染
 */

import React from 'react';
import { render } from 'ink';
import { PlatformAdapter } from '../base';
import { ToolStateManager } from '../../tools/state';
import { setGlobalLogLevel, LogLevel } from '../../logger';
import { App, AppHandle } from './App';

export class ConsolePlatform extends PlatformAdapter {
  private sessionId: string;
  private inkInstance?: { unmount: () => void; waitUntilExit: () => Promise<void> };
  private appHandle?: AppHandle;
  private toolStateManager?: ToolStateManager;

  /** 当前响应周期内的工具调用 ID 集合 */
  private currentToolIds = new Set<string>();

  constructor(sessionId: string = 'console-default') {
    super();
    this.sessionId = sessionId;
  }

  // ============ 平台接口 ============

  /** 接收工具状态管理器，监听事件以同步 UI */
  setToolStateManager(manager: ToolStateManager): void {
    this.toolStateManager = manager;

    manager.on('created', (invocation) => {
      this.currentToolIds.add(invocation.id);
      this.syncToolDisplay();
    });

    manager.on('stateChange', () => {
      this.syncToolDisplay();
    });
  }

  async start(): Promise<void> {
    // 压制日志输出，防止干扰 ink 渲染
    setGlobalLogLevel(LogLevel.SILENT);

    // 等待 App 组件挂载完成并交付 AppHandle
    const readyPromise = new Promise<AppHandle>((resolve) => {
      this.inkInstance = render(
        React.createElement(App, {
          onReady: (handle: AppHandle) => {
            this.appHandle = handle;
            resolve(handle);
          },
          onSubmit: (text: string) => this.handleInput(text),
          onExit: () => this.stop(),
        }),
      );
    });

    await readyPromise;
  }

  async stop(): Promise<void> {
    this.inkInstance?.unmount();
    process.exit(0);
  }

  /** 非流式发送消息 */
  async sendMessage(_sessionId: string, text: string): Promise<void> {
    this.appHandle?.addMessage('assistant', text);
  }

  /** 流式发送消息 */
  async sendMessageStream(_sessionId: string, stream: AsyncIterable<string>): Promise<void> {
    this.appHandle?.startStream();
    for await (const chunk of stream) {
    this.appHandle?.pushStreamChunk(chunk);
    }
    this.appHandle?.endStream();
  }

  // ============ 内部方法 ============

  /** 处理用户输入 */
  private async handleInput(text: string): Promise<void> {
    if (!this.messageHandler) return;

    // 显示用户消息，进入生成状态
    this.appHandle?.addMessage('user', text);
    this.appHandle?.setGenerating(true);

    // 清空上一轮的工具调用记录
    this.currentToolIds.clear();
    this.appHandle?.setToolInvocations([]);

    try {
      await this.messageHandler({
        sessionId: this.sessionId,
        parts: [{ text }],
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.appHandle?.addMessage('assistant', `错误: ${errorMsg}`);
    } finally {
      this.appHandle?.setGenerating(false);
    }
  }

  /** 将当前周期的工具调用状态同步到 UI */
  private syncToolDisplay(): void {
    if (!this.toolStateManager || !this.appHandle) return;
    const invocations = this.toolStateManager
      .getAll()
      .filter(inv => this.currentToolIds.has(inv.id));
    this.appHandle.setToolInvocations(invocations);
  }
}
