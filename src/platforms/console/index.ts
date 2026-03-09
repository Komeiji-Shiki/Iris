/**
 * Console 平台适配器
 *
 * 通过终端标准输入/输出与用户交互，主要用于开发和调试。
 *
 * 支持命令：
 *   /quit  - 退出
 *   /clear - 清空当前会话（需配合 orchestrator 使用）
 *   /help  - 显示帮助
 */

import * as readline from 'readline';
import { PlatformAdapter } from '../base';
import { createLogger } from '../../logger';

const logger = createLogger('Console');

export class ConsolePlatform extends PlatformAdapter {
  private rl?: readline.Interface;
  private sessionId: string;

  constructor(sessionId: string = 'console-default') {
    super();
    this.sessionId = sessionId;
  }

  async start(): Promise<void> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('='.repeat(50));
    console.log('  AI Chat Console');
    console.log('  输入消息开始对话，/help 查看命令');
    console.log('='.repeat(50));
    console.log();

    this.rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // 处理内置命令
      if (trimmed.startsWith('/')) {
        await this.handleCommand(trimmed);
        return;
      }

      // 将用户输入转发给消息处理器
      if (this.messageHandler) {
        try {
          await this.messageHandler({
            sessionId: this.sessionId,
            parts: [{ text: trimmed }],
          });
        } catch (err) {
          logger.error('处理消息时出错:', err);
        }
      }
    });
  }

  async stop(): Promise<void> {
    this.rl?.close();
    console.log('[Console] 已停止。');
  }

  async sendMessage(_sessionId: string, text: string): Promise<void> {
    console.log();
    console.log(`[AI] ${text}`);
    console.log();
  }

  /** 流式输出：逐块打印到终端 */
  async sendMessageStream(_sessionId: string, stream: AsyncIterable<string>): Promise<void> {
    process.stdout.write('\n[AI] ');
    for await (const chunk of stream) {
      process.stdout.write(chunk);
    }
    process.stdout.write('\n\n');
  }

  private async handleCommand(cmd: string): Promise<void> {
    switch (cmd) {
      case '/quit':
        await this.stop();
        process.exit(0);
        break;
      case '/clear':
        if (this.clearHandler) {
          await this.clearHandler(this.sessionId);
        }
        console.log('[Console] 会话已清空。');
        break;
      case '/help':
        console.log('  /quit  - 退出程序');
        console.log('  /clear - 清空会话历史');
        console.log('  /help  - 显示此帮助');
        break;
      default:
        console.log(`[Console] 未知命令: ${cmd}`);
    }
  }
}
