/**
 * 入口文件
 *
 * 根据配置创建各模块实例，组装并启动应用。
 */

import { loadConfig } from './config';

// 平台
import { PlatformAdapter } from './platforms/base';
import { ConsolePlatform } from './platforms/console';
import { DiscordPlatform } from './platforms/discord';
import { TelegramPlatform } from './platforms/telegram';

// LLM
import { LLMProvider } from './llm/providers/base';
import { createGeminiProvider } from './llm/providers/gemini';
import { createOpenAICompatibleProvider } from './llm/providers/openai-compatible';

// 存储
import { JsonFileStorage } from './storage/json-file';

// 工具
import { ToolRegistry } from './tools/registry';
import { ToolStateManager } from './tools/state';
import { getCurrentTime, calculator } from './tools/builtin/example';
import { readFile } from './tools/builtin/read-file';
import { searchReplace } from './tools/builtin/search-replace';
import { terminal } from './tools/builtin/terminal';
import { applyDiff } from './tools/builtin/apply-diff';

// 提示词
import { PromptAssembler } from './prompt/assembler';
import { DEFAULT_SYSTEM_PROMPT } from './prompt/templates/default';

// 核心
import { Orchestrator } from './core/orchestrator';

async function main() {
  const config = loadConfig();

  // ---- 1. 创建平台适配器 ----
  let platform:PlatformAdapter;
  switch (config.platform.type) {
    case 'discord':
      platform = new DiscordPlatform({ token: config.platform.discord.token });
      break;
    case 'telegram':
      platform = new TelegramPlatform({ token: config.platform.telegram.token });
      break;
    case 'console':
    default:
      platform = new ConsolePlatform();
      break;
  }

  // ---- 2. 创建 LLM 提供商 ----
  let llm: LLMProvider;
  switch (config.llm.provider) {
    case 'openai-compatible':
      llm = createOpenAICompatibleProvider({
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        baseUrl: config.llm.baseUrl,
      });
      break;
    case 'gemini':
    default:
      llm = createGeminiProvider({
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        baseUrl: config.llm.baseUrl,
      });
      break;
  }

  // ---- 3. 创建存储 ----
  const storage = new JsonFileStorage(config.storage.dir);

  // ---- 4. 注册工具 ----
  const tools = new ToolRegistry();
  tools.registerAll([getCurrentTime, calculator, readFile, searchReplace, terminal, applyDiff]);

  // ---- 4a. 创建工具状态管理器 ----
  const toolState = new ToolStateManager();

  // ---- 5. 配置提示词 ----
  const prompt = new PromptAssembler();
  prompt.setSystemPrompt(config.system.systemPrompt || DEFAULT_SYSTEM_PROMPT);

  // ---- 6. 创建并启动协调器 ----
  const orchestrator = new Orchestrator(platform, llm, storage, tools, toolState, prompt, {
    maxToolRounds: config.system.maxToolRounds,
    stream: config.system.stream,
  });

  await orchestrator.start();
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
