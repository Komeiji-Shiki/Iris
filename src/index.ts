/**
 * 入口文件
 *
 * 根据配置创建各模块实例，组装并启动应用。
 */

import { loadConfig, findConfigFile } from './config';

// 平台
import { PlatformAdapter } from './platforms/base';
import { ConsolePlatform } from './platforms/console';
import { DiscordPlatform } from './platforms/discord';
import { TelegramPlatform } from './platforms/telegram';
import { WebPlatform } from './platforms/web';

// LLM
import { LLMProvider } from './llm/providers/base';
import { createGeminiProvider } from './llm/providers/gemini';
import { createOpenAICompatibleProvider } from './llm/providers/openai-compatible';
import { createClaudeProvider } from './llm/providers/claude';

// 存储
import { JsonFileStorage } from './storage/json-file';
import { SqliteStorage } from './storage/sqlite';

// 记忆
import { createMemoryProvider, createMemoryTools, MemoryProvider } from './memory';

// 工具
import { ToolRegistry } from './tools/registry';
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

  // ---- 1. 创建 LLM 提供商 ----
  let llm: LLMProvider;
  switch (config.llm.provider) {
    case 'openai-compatible':
      llm = createOpenAICompatibleProvider({
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        baseUrl: config.llm.baseUrl,
      });
      break;
    case 'claude':
      llm = createClaudeProvider({
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

  // ---- 2. 创建存储 ----
  let storage;
  switch (config.storage.type) {
    case 'sqlite':
      storage = new SqliteStorage(config.storage.dbPath);
      break;
    case 'json-file':
    default:
      storage = new JsonFileStorage(config.storage.dir);
      break;
  }

  // ---- 2.5 创建记忆模块 ----
  let memory: MemoryProvider | undefined;
  if (config.memory?.enabled) {
    memory = createMemoryProvider({ dbPath: config.memory.dbPath });
  }

  // ---- 3. 注册工具 ----
  const tools = new ToolRegistry();
  tools.registerAll([getCurrentTime, calculator, readFile, searchReplace, terminal, applyDiff]);
  if (memory) {
    tools.registerAll(createMemoryTools(memory));
  }

  // ---- 4. 创建平台适配器 ----
  let platform: PlatformAdapter;
  switch (config.platform.type) {
    case 'discord':
      platform = new DiscordPlatform({ token: config.platform.discord.token });
      break;
    case 'telegram':
      platform = new TelegramPlatform({ token: config.platform.telegram.token });
      break;
    case 'web':
      platform = new WebPlatform({
        port: config.platform.web.port,
        host: config.platform.web.host,
        storage,
        tools,
        configPath: findConfigFile(),
        llmName: config.llm.provider,
        modelName: config.llm.model,
        streamEnabled: config.system.stream,
      });
      break;
    case 'console':
    default:
      platform = new ConsolePlatform();
      break;
  }

  // ---- 5. 配置提示词 ----
  const prompt = new PromptAssembler();
  prompt.setSystemPrompt(config.system.systemPrompt || DEFAULT_SYSTEM_PROMPT);

  // ---- 6. 创建并启动协调器 ----
  const orchestrator = new Orchestrator(platform, llm, storage, tools, prompt, {
    maxToolRounds: config.system.maxToolRounds,
    stream: config.system.stream,
  }, memory);

  await orchestrator.start();
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
