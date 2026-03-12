<template>
  <div
    class="overlay"
    @pointerdown.self="handleOverlayPointerDown"
    @pointerup.self="handleOverlayPointerUp"
    @pointercancel.self="resetOverlayCloseIntent"
  >
    <div class="settings-panel" @pointerdown="resetOverlayCloseIntent">
      <div class="settings-header">
        <div class="settings-title-group">
          <span class="settings-kicker">Control Center</span>
          <h2>设置中心</h2>
          <p>配置模型连接、系统策略与工具能力，打造你的 AI 工作台。</p>
          <p v-if="managementEnabled" class="field-hint" style="margin-top:6px">
            管理接口已启用令牌保护。当前状态：
            <strong :style="{ color: managementReady ? 'var(--success)' : 'var(--error)' }">{{ managementReady ? '已解锁' : '未解锁' }}</strong>
          </p>
        </div>
        <button class="btn-close" type="button" aria-label="关闭设置" @click="requestClose">
          <AppIcon :name="ICONS.common.close" />
        </button>
      </div>

      <div class="settings-body">
        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>模型与凭证</h3>
              <p>配置模型池，使用模型名称作为键，默认模型决定启动时的活动模型。</p>
            </div>
            <span class="settings-pill">LLM</span>
          </div>

          <div class="settings-grid two-columns" style="margin-bottom:16px">
            <div class="form-group">
              <label>默认模型</label>
              <select v-model="defaultModelName" :disabled="defaultModelOptions.length === 0">
                <option v-if="defaultModelOptions.length === 0" value="">请先填写模型名称</option>
                <option v-for="option in defaultModelOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <p class="field-hint">启动时默认使用这个模型名称。`/model` 也使用这个名称切换。</p>
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;justify-content:flex-end">
              <button class="btn-save" type="button" @click="addModelEntry">新增模型</button>
            </div>
          </div>

          <div v-for="(entry, index) in modelEntries" :key="entry.uid" class="tier-block">
            <div class="tier-header" @click="entry.open = !entry.open">
              <span class="tier-arrow" :class="{ open: entry.open }">▶</span>
              <span class="tier-label">{{ entry.modelName || `未命名模型 ${index + 1}` }}</span>
              <span class="tier-desc">{{ providerLabel(entry.provider) }} · {{ entry.modelId || '未填写模型 ID' }}</span>
              <span v-if="defaultModelName === entry.modelName && entry.modelName" class="settings-pill" style="margin-left:auto">默认</span>
              <button
                class="btn-inline-action"
                type="button"
                style="margin-left:8px"
                :disabled="modelEntries.length <= 1"
                @click.stop="removeModelEntry(index)"
              >
                删除
              </button>
            </div>
            <div v-show="entry.open" class="tier-body">
              <div class="settings-grid two-columns">
                <div class="form-group">
                  <label>模型名称</label>
                  <input type="text" v-model="entry.modelName" placeholder="例如：gemini_flash" />
                  <p class="field-hint">作为 llm.models 下的键，也作为 `/model` 的切换名称。</p>
                </div>
                <div class="form-group">
                  <label>LLM 提供商</label>
                  <select v-model="entry.provider" @change="handleModelProviderChange(entry)">
                    <option value="gemini">Gemini</option>
                    <option value="openai-compatible">OpenAI 兼容</option>
                    <option value="openai-responses">OpenAI Responses</option>
                    <option value="claude">Claude</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>模型 ID</label>
                  <div class="inline-field-actions">
                    <input type="text" v-model="entry.modelId" placeholder="例如：gpt-4o 或 gemini-2.0-flash" />
                    <button class="btn-inline-action" type="button"
                            :disabled="entry.modelCatalog.loading || (managementEnabled && !managementReady)"
                            @click="fetchModelOptions(index)">
                      {{ entry.modelCatalog.loading ? '拉取中...' : '拉取列表' }}
                    </button>
                  </div>
                  <select v-if="entry.modelCatalog.options.length > 0" v-model="entry.modelId" class="model-list-select">
                    <option value="">选择已发现的模型（也可继续手动输入）</option>
                    <option v-for="option in entry.modelCatalog.options" :key="option.id" :value="option.id">{{ option.label }}</option>
                  </select>
                  <p class="field-hint" :class="{ 'model-fetch-error': !!entry.modelCatalog.error }">{{ modelCatalogHint(entry) }}</p>
                </div>
                <div class="form-group full-width">
                  <label>API Key</label>
                  <input type="password" v-model="entry.apiKey" placeholder="输入或保留已有密钥" />
                  <p class="field-hint">{{ modelKeyHint(entry) }}</p>
                </div>
                <div class="form-group full-width">
                  <label>API 地址</label>
                  <input type="text" v-model="entry.baseUrl" placeholder="模型服务请求地址" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>系统行为</h3>
              <p>调节提示词、工具轮次与回复方式。</p>
            </div>
            <span class="settings-pill">System</span>
          </div>

          <div class="settings-grid two-columns">
            <div class="form-group full-width">
              <label>系统提示词</label>
              <textarea
                v-model="config.systemPrompt"
                rows="5"
                placeholder="输入系统提示词，定义你的默认协作风格"
              ></textarea>
            </div>

            <div class="form-group">
              <label>工具最大轮次</label>
              <input
                type="number"
                :value="maxToolRoundsInput"
                min="1"
                max="50"
                @input="handleMaxToolRoundsInput"
                @blur="syncMaxToolRoundsInput"
              />
            </div>

            <div class="settings-switch-row">
              <div>
                <span class="switch-label">流式输出</span>
                <p class="field-hint">{{ streamHint }}</p>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" v-model="config.stream" />
                <span class="toggle-switch-ui"></span>
              </label>
            </div>

            <div class="settings-switch-row">
              <div>
                <span class="switch-label">界面主题</span>
                <p class="field-hint">{{ themeHint }}</p>
              </div>
              <div class="theme-selector">
                <button
                  v-for="opt in themeOptions"
                  :key="opt.value"
                  class="theme-option"
                  :class="{ active: currentTheme === opt.value }"
                  type="button"
                  @click="setTheme(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>MCP 服务器</h3>
              <p>连接外部 MCP 服务器，自动将其工具注入 LLM 工具列表。</p>
            </div>
            <span class="settings-pill">{{ mcpServers.length }} 个服务器</span>
          </div>

          <div v-for="(server, idx) in mcpServers" :key="idx" class="tier-block">
            <div class="tier-header" @click="server.open = !server.open">
              <span class="tier-arrow" :class="{ open: server.open }">▶</span>
              <span class="tier-label">{{ server.name || '未命名' }}</span>
              <span class="tier-desc">{{ server.transport === 'stdio' ? '本地进程' : 'HTTP' }}</span>
              <label class="toggle-switch tier-toggle" @click.stop>
                <input type="checkbox" v-model="server.enabled" />
                <span class="toggle-switch-ui"></span>
              </label>
              <button class="btn-mcp-remove" type="button" @click.stop="removeMcpServer(idx)" title="删除服务器">
                <AppIcon :name="ICONS.common.close" />
              </button>
            </div>
            <div v-show="server.open" class="tier-body">
              <div class="settings-grid two-columns">
                <div class="form-group">
                  <label>服务器名称</label>
                  <input type="text" v-model="server.name" placeholder="仅字母、数字、下划线"
                         @input="sanitizeMcpName(server)" />
                </div>
                <div class="form-group">
                  <label>传输方式</label>
                  <select v-model="server.transport">
                    <option value="stdio">stdio（本地进程）</option>
                    <option value="http">HTTP（远程服务器）</option>
                  </select>
                </div>

                <template v-if="server.transport === 'stdio'">
                  <div class="form-group">
                    <label>命令</label>
                    <input type="text" v-model="server.command" placeholder="例如：npx" />
                  </div>
                  <div class="form-group">
                    <label>工作目录</label>
                    <input type="text" v-model="server.cwd" placeholder="可选" />
                  </div>
                  <div class="form-group full-width">
                    <label>参数（每行一个）</label>
                    <textarea v-model="server.args" rows="3"
                              placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/path/to/dir"></textarea>
                  </div>
                </template>

                <template v-if="server.transport === 'http'">
                  <div class="form-group full-width">
                    <label>URL</label>
                    <input type="text" v-model="server.url" placeholder="https://mcp.example.com/mcp" />
                  </div>
                  <div class="form-group full-width">
                    <label>Authorization</label>
                    <input type="password" v-model="server.authHeader" placeholder="Bearer your-token（可选）" />
                    <p v-if="server.authHeader.startsWith('****')" class="field-hint">已读取已保存值，保持不变则不会覆盖。</p>
                  </div>
                </template>

                <div class="form-group">
                  <label>超时（毫秒）</label>
                  <input
                    type="number"
                    :value="server.timeoutInput"
                    min="1000"
                    max="120000"
                    @input="handleMcpTimeoutInput(server, $event)"
                    @blur="syncMcpTimeoutInput(server)"
                  />
                </div>
              </div>
            </div>
          </div>

          <button class="btn-mcp-add" type="button" @click="addMcpServer">+ 添加 MCP 服务器</button>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>工具状态</h3>
              <p>当前挂载到模型上下文中的可用能力。</p>
            </div>
            <span class="settings-pill">{{ tools.length }} 个工具</span>
          </div>

          <div class="tools-list">
            <span v-for="tool in tools" :key="tool" class="tool-tag">{{ tool }}</span>
            <span v-if="tools.length === 0" class="text-muted">无已注册工具</span>
          </div>
        </section>

        <!-- Cloudflare 管理 -->
        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>Cloudflare 管理</h3>
              <p>{{ cf.connected ? '管理 DNS 记录与 SSL 配置。' : '连接 Cloudflare 以管理域名和安全策略。请先在「部署生成器」页完成 Nginx 配置。' }}</p>
              <p v-if="cf.tokenSource" class="field-hint" style="margin-top:6px">
                Token 来源：{{ cf.tokenSource === 'env' ? '环境变量' : (cf.tokenSource === 'file' ? '文件' : '配置文件明文') }}
              </p>
            </div>
            <span class="settings-pill" :style="{ background: cf.connected ? 'var(--success)' : undefined }">
              {{ cf.connected ? '已连接' : '未连接' }}
            </span>
          </div>

          <!-- 未配置：引导输入 token -->
          <div v-if="!cf.connected" class="settings-grid two-columns">
            <div class="form-group full-width cf-guide-steps">
              <p class="field-hint" style="line-height:1.8">
                <strong style="color:var(--text-secondary)">快速开始：</strong><br/>
                1. 打开
                <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener"
                   style="color:var(--accent-cyan, var(--accent));text-decoration:underline">
                  Cloudflare API Tokens 页面
                </a>，点击 "Create Token"<br/>
                2. 选择 "Edit zone DNS" 模板，或自定义权限：<br/>
                <span style="padding-left:1.2em;display:inline-block">
                  Zone &gt; Zone &gt; Read，Zone &gt; DNS &gt; Edit，Zone &gt; Zone Settings &gt; Edit
                </span><br/>
                3. 将生成的 Token 粘贴到下方
              </p>
            </div>
            <div class="form-group full-width">
              <label>API Token</label>
              <input type="password" v-model="cf.tokenInput" placeholder="以 Bearer token 格式，例如 xyzABC123..." />
            </div>
            <div class="form-group full-width" style="display:flex;align-items:center;gap:12px">
              <button class="btn-save" type="button" :disabled="cf.loading" @click="handleCfSetup">
                {{ cf.loading ? '验证中...' : '连接' }}
              </button>
              <span v-if="cf.error" class="settings-status error">{{ cf.error }}</span>
            </div>
          </div>

          <!-- 已配置：zone 信息 + SSL + DNS -->
          <template v-if="cf.connected">
            <!-- 多 zone 选择器 -->
            <div v-if="cf.zones.length > 1" class="form-group">
              <label>选择域名</label>
              <select v-model="cf.activeZoneId" :disabled="cf.sslSaving" @change="handleZoneChange">
                <option v-for="zone in cf.zones" :key="zone.id" :value="zone.id">
                  {{ zone.name }} ({{ zone.status }})
                </option>
              </select>
            </div>

            <!-- 单 zone 卡片 -->
            <div v-else class="cf-zone-card" v-for="zone in cf.zones" :key="zone.id">
              <span class="cf-zone-name">{{ zone.name }}</span>
              <span class="cf-zone-status" :class="{ active: zone.status === 'active' }">
                {{ zone.status }}
              </span>
            </div>

            <!-- SSL 模式 -->
            <div class="settings-grid two-columns" style="margin-top:12px">
              <div class="form-group">
                <label>SSL 模式</label>
                <select v-model="cf.sslMode" :disabled="cf.sslLoading || cf.sslSaving" @change="handleSslChange">
                  <option value="unknown" disabled>Unknown — 无法读取当前状态</option>
                  <option value="off">Off — 不加密</option>
                  <option value="flexible">Flexible — 浏览器到 CF 加密</option>
                  <option value="full">Full — 全程加密（不验证源站证书）</option>
                  <option value="strict">Full (Strict) — 全程加密 + 验证源站证书</option>
                </select>
                <p class="field-hint">{{ cf.sslSaving ? '正在保存 SSL 模式...' : (cf.sslLoading ? '正在读取当前 SSL 模式...' : (sslHints[cf.sslMode] || '')) }}</p>
                <p v-if="!cf.sslLoading && (cf.sslMode === 'full' || cf.sslMode === 'strict')" class="field-hint" style="margin-top:4px;color:var(--accent-cyan, var(--accent))">
                  需要 Nginx 开启 HTTPS（443 端口 + SSL 证书），否则 CF 到源站连接会失败（521/525）。
                </p>
                <p v-if="!cf.sslLoading && cf.sslMode === 'flexible'" class="field-hint" style="margin-top:4px;color:var(--accent-cyan, var(--accent))">
                  Nginx 只需监听 80 端口即可，无需配置 SSL 证书。
                </p>
              </div>
              <div class="form-group" style="display:flex;align-items:flex-end">
                <span v-if="cf.sslMsg" class="settings-status" :class="{ error: cf.sslError }">{{ cf.sslMsg }}</span>
              </div>
            </div>

            <!-- DNS 记录 -->
            <div style="margin-top:16px">
              <label style="display:block;margin-bottom:8px;font-size:0.85rem;color:var(--text-secondary)">DNS 记录</label>
              <div class="cf-dns-table">
                <div class="cf-dns-header">
                  <span>类型</span><span>名称</span><span>内容</span><span>代理</span><span></span>
                </div>
                <div v-if="cf.dnsLoading" class="text-muted" style="padding:8px">加载中...</div>
                <div v-else-if="cf.dnsRecords.length === 0" class="text-muted" style="padding:8px">暂无记录</div>
                <div v-for="rec in cf.dnsRecords" :key="rec.id" class="cf-dns-row">
                  <span class="cf-dns-type">{{ rec.type }}</span>
                  <span class="cf-dns-name" :title="rec.name">{{ rec.name }}</span>
                  <span class="cf-dns-content" :title="rec.content">{{ rec.content }}</span>
                  <span>{{ rec.proxied ? 'ON' : 'OFF' }}</span>
                  <button class="btn-dns-delete" type="button" :disabled="cf.dnsSaving || cf.dnsDeletingId === rec.id" @click="confirmDnsDelete(rec)" title="删除" aria-label="删除 DNS 记录">
                    <AppIcon :name="ICONS.common.close" />
                  </button>
                </div>
              </div>

              <!-- 添加 DNS 记录 -->
              <div class="cf-dns-add">
                <select v-model="cf.newDns.type" class="cf-dns-add-type">
                  <option value="A">A</option>
                  <option value="AAAA">AAAA</option>
                  <option value="CNAME">CNAME</option>
                  <option value="MX">MX</option>
                  <option value="TXT">TXT</option>
                </select>
                <input type="text" v-model="cf.newDns.name" :placeholder="dnsNamePlaceholder" class="cf-dns-add-input" />
                <input type="text" v-model="cf.newDns.content" :placeholder="dnsContentPlaceholder" class="cf-dns-add-input" />
                <label class="cf-dns-add-proxied" :title="'开启后流量经过 Cloudflare CDN 代理，获得 DDoS 防护和缓存加速'">
                  <input type="checkbox" v-model="cf.newDns.proxied" :disabled="!dnsProxySupported" /> CDN 代理
                </label>
                <button class="btn-save" type="button" :disabled="cf.dnsSaving || !!cf.dnsDeletingId || cf.dnsLoading" style="padding:6px 14px;font-size:0.8rem" @click="handleDnsAdd">
                  添加
                </button>
              </div>
              <span v-if="cf.dnsMsg" class="settings-status" :class="{ error: cf.dnsError }" style="display:block;margin-top:6px">
                {{ cf.dnsMsg }}
              </span>
            </div>
          </template>
        </section>

        <div class="form-actions">
          <span v-if="saving" class="settings-status">自动保存中...</span>
          <span v-else-if="statusText" class="settings-status" :class="{ error: statusError }">
            {{ statusText }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { getConfig, updateConfig, getStatus, fetchConfigModels, cfGetStatus, cfSetup, cfListDns, cfAddDns, cfRemoveDns, cfGetSsl, cfSetSsl } from '../api/client'
import type { CfDnsRecord, ConfigModelOption, CloudflareSslMode } from '../api/types'
import { useTheme, type ThemeMode } from '../composables/useTheme'
import AppIcon from './AppIcon.vue'
import { ICONS } from '../constants/icons'
import { loadManagementToken, subscribeManagementTokenChange } from '../utils/managementToken'

const emit = defineEmits<{ close: [] }>()

const managementEnabled = ref(false)
const managementReady = ref(false)

let unsubscribeManagementToken: (() => void) | null = null

function refreshManagementState() {
  const token = loadManagementToken().trim()
  managementReady.value = !!token
}

// ============ 主题 ============
const { theme: currentTheme, setTheme } = useTheme()

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: '暗色' },
  { value: 'light', label: '浅色' },
  { value: 'system', label: '跟随系统' },
]

const themeHint = computed(() => {
  const hints: Record<ThemeMode, string> = {
    dark: '使用深色背景，适合夜间和低光环境。',
    light: '使用浅色背景，适合日间和明亮环境。',
    system: '自动跟随操作系统的主题偏好设置。',
  }
  return hints[currentTheme.value]
})

const config = reactive({
  systemPrompt: '',
  maxToolRounds: 10,
  stream: true,
})

const maxToolRoundsInput = ref(String(config.maxToolRounds))

interface ModelCatalogState {
  loading: boolean
  error: string
  options: ConfigModelOption[]
  baseUrl: string
  usedStoredApiKey: boolean
}

interface ModelEntry {
  uid: number
  open: boolean
  originalModelName: string
  provider: string
  apiKey: string
  modelName: string
  modelId: string
  baseUrl: string
  modelCatalog: ModelCatalogState
  modelCatalogRequestVersion: number
  lastProvider: string
}

let nextModelEntryUid = 1

/** Provider 默认值，与 src/config/llm.ts DEFAULTS 保持一致 */
const PROVIDER_DEFAULTS: Record<string, { model: string; baseUrl: string }> = {
  'gemini': { model: 'gemini-2.0-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  'openai-compatible': { model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
  'openai-responses': { model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' },
  'claude': { model: 'claude-sonnet-4-6', baseUrl: 'https://api.anthropic.com/v1' },
}

function createModelCatalogState(): ModelCatalogState {
  return {
    loading: false,
    error: '',
    options: [],
    baseUrl: '',
    usedStoredApiKey: false,
  }
}

function createModelEntry(provider = 'gemini', data: Partial<ModelEntry> = {}): ModelEntry {
  const defaults = PROVIDER_DEFAULTS[provider] ?? { model: '', baseUrl: '' }
  return {
    uid: nextModelEntryUid++,
    open: data.open ?? true,
    originalModelName: data.originalModelName ?? '',
    provider,
    apiKey: data.apiKey ?? '',
    modelName: data.modelName ?? '',
    modelId: data.modelId ?? defaults.model,
    baseUrl: data.baseUrl ?? defaults.baseUrl,
    modelCatalog: createModelCatalogState(),
    modelCatalogRequestVersion: 0,
    lastProvider: provider,
  }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function syncMaxToolRoundsInput() {
  maxToolRoundsInput.value = String(config.maxToolRounds)
}

function handleMaxToolRoundsInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  maxToolRoundsInput.value = value

  if (!value.trim()) return

  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    config.maxToolRounds = clampInteger(parsed, 1, 50)
  }
}

const modelEntries = reactive<ModelEntry[]>([createModelEntry()])
const defaultModelName = ref('')
const modelOriginalNames = ref<string[]>([])

/** 初始加载完成前抑制 provider watcher 的副作用 */
let configLoaded = false

function providerLabel(provider: string): string {
  const map: Record<string, string> = {
    gemini: 'Gemini',
    'openai-compatible': 'OpenAI 兼容',
    'openai-responses': 'OpenAI Responses',
    claude: 'Claude',
  }
  return map[provider] || provider
}

const defaultModelOptions = computed(() => {
  return modelEntries
    .map((entry, index) => {
      const value = entry.modelName.trim()
      return {
        value,
        label: value || `未命名模型 ${index + 1}`,
      }
    })
    .filter(option => !!option.value)
})

function syncDefaultModelName(newNames: string[], oldNames: string[] = []) {
  const normalizedNewNames = newNames.map(name => name.trim())
  if (normalizedNewNames.every(name => !name)) {
    defaultModelName.value = ''
    return
  }

  const current = defaultModelName.value.trim()
  if (current && normalizedNewNames.includes(current)) {
    defaultModelName.value = current
    return
  }

  const renamedIndex = oldNames.findIndex(name => name === current)
  if (renamedIndex >= 0 && normalizedNewNames[renamedIndex]) {
    defaultModelName.value = normalizedNewNames[renamedIndex]
    return
  }

  defaultModelName.value = normalizedNewNames.find(Boolean) || ''
}

watch(
  () => modelEntries.map(entry => entry.modelName.trim()),
  (newNames, oldNames) => {
    syncDefaultModelName(newNames, oldNames ?? [])
  },
)

function addModelEntry() {
  modelEntries.push(createModelEntry())
}

function removeModelEntry(index: number) {
  if (modelEntries.length <= 1) return
  const [removed] = modelEntries.splice(index, 1)
  if (removed && defaultModelName.value === removed.modelName.trim()) {
    syncDefaultModelName(modelEntries.map(entry => entry.modelName.trim()))
  }
}

function resetModelCatalog(entry: ModelEntry) {
  entry.modelCatalogRequestVersion += 1
  Object.assign(entry.modelCatalog, createModelCatalogState())
}

function handleModelProviderChange(entry: ModelEntry) {
  const oldDefaults = PROVIDER_DEFAULTS[entry.lastProvider] ?? { model: '', baseUrl: '' }
  const newDefaults = PROVIDER_DEFAULTS[entry.provider] ?? { model: '', baseUrl: '' }
  if (!entry.modelId || entry.modelId === oldDefaults.model) entry.modelId = newDefaults.model
  if (!entry.baseUrl || entry.baseUrl === oldDefaults.baseUrl) entry.baseUrl = newDefaults.baseUrl
  if (entry.apiKey.startsWith('****')) entry.apiKey = ''
  entry.lastProvider = entry.provider
  resetModelCatalog(entry)
}

function modelKeyHint(entry: ModelEntry): string {
  if (!entry.apiKey) return '未配置 API Key。'
  if (entry.apiKey.startsWith('****')) return '已读取已保存密钥，保持不变则不会覆盖。'
  return '将使用当前输入的密钥保存配置。'
}

function modelCatalogHint(entry: ModelEntry): string {
  const state = entry.modelCatalog
  if (state.error) return state.error
  if (managementEnabled.value && !managementReady.value) return '管理令牌未解锁，暂时无法拉取模型列表。'
  if (state.options.length > 0) {
    return `已从 ${state.baseUrl} 拉取 ${state.options.length} 个模型${state.usedStoredApiKey ? '（使用已保存 API Key）' : ''}。也可继续手动输入。`
  }
  return '填写 API 地址与 Key 后，可拉取模型列表，也可继续手动输入模型 ID。'
}

function normalizeApiKeyForLookup(apiKey: string): string | undefined {
  const trimmed = apiKey.trim()
  if (!trimmed || trimmed.startsWith('****')) return undefined
  return trimmed
}

async function fetchModelOptions(index: number) {
  const entry = modelEntries[index]
  if (!entry) return
  const state = entry.modelCatalog
  const requestVersion = ++entry.modelCatalogRequestVersion

  state.loading = true
  state.error = ''

  try {
    const result = await fetchConfigModels({
      modelName: entry.modelName.trim() || undefined,
      provider: entry.provider,
      baseUrl: entry.baseUrl,
      apiKey: normalizeApiKeyForLookup(entry.apiKey),
    })

    if (requestVersion !== entry.modelCatalogRequestVersion) return

    state.options = result.models
    state.baseUrl = result.baseUrl
    state.usedStoredApiKey = result.usedStoredApiKey

    if (result.models.length === 0) {
      state.error = '接口已连接，但没有返回可用模型。你仍可手动输入模型 ID。'
      return
    }

    if (!entry.modelId) {
      entry.modelId = result.models[0].id
    }
  } catch (err: any) {
    if (requestVersion !== entry.modelCatalogRequestVersion) return
    state.error = '拉取失败：' + (err?.message || '未知错误')
  } finally {
    if (requestVersion === entry.modelCatalogRequestVersion) {
      state.loading = false
    }
  }
}

watch(() => JSON.stringify(modelEntries.map(entry => ({ provider: entry.provider, baseUrl: entry.baseUrl, apiKey: entry.apiKey, modelName: entry.modelName }))), () => {
  if (!configLoaded) return
  modelEntries.forEach(entry => resetModelCatalog(entry))
})

const tools = ref<string[]>([])
const statusText = ref('')
const statusError = ref(false)
const saving = ref(false)
const dirty = ref(false)

// ============ MCP ============
interface MCPServerEntry {
  name: string
  transport: 'stdio' | 'http'
  command: string
  args: string       // 每行一个参数，保存时转为 string[]
  cwd: string
  url: string
  authHeader: string  // Authorization header 值
  timeout: number
  timeoutInput: string
  enabled: boolean
  open: boolean       // UI 展开状态
}

const mcpServers = reactive<MCPServerEntry[]>([])
/** 加载时记录的原始服务器名，用于保存时识别被删除的服务器 */
const mcpOriginalNames = ref<string[]>([])

function addMcpServer() {
  mcpServers.push({
    name: '', transport: 'stdio', command: '', args: '', cwd: '',
    url: '', authHeader: '', timeout: 30000, timeoutInput: '30000', enabled: true, open: true,
  })
}

function removeMcpServer(idx: number) {
  mcpServers.splice(idx, 1)
}

function syncMcpTimeoutInput(server: MCPServerEntry) {
  server.timeoutInput = String(server.timeout)
}

function handleMcpTimeoutInput(server: MCPServerEntry, event: Event) {
  const value = (event.target as HTMLInputElement).value
  server.timeoutInput = value

  if (!value.trim()) return

  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    server.timeout = clampInteger(parsed, 1000, 120000)
  }
}

function sanitizeMcpName(server: MCPServerEntry) {
  server.name = server.name.replace(/[^a-zA-Z0-9_]/g, '_')
}

function findDuplicateMcpNames(): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const server of mcpServers) {
    const normalized = server.name.trim()
    if (!normalized) continue

    if (seen.has(normalized)) {
      duplicates.add(normalized)
      continue
    }

    seen.add(normalized)
  }

  return Array.from(duplicates)
}

function buildMCPPayload(): { payload: any; currentNames: string[] } {
  const servers: Record<string, any> = {}
  // 被删除的服务器发送 null（deepMerge 会删除该键）
  for (const name of mcpOriginalNames.value) {
    if (!mcpServers.some(s => s.name === name)) {
      servers[name] = null
    }
  }
  const currentNames: string[] = []
  for (const s of mcpServers) {
    if (!s.name.trim()) continue
    currentNames.push(s.name)
    const entry: any = {
      transport: s.transport,
      enabled: s.enabled,
      timeout: clampInteger(s.timeout || 30000, 1000, 120000),
    }
    if (s.transport === 'stdio') {
      entry.command = s.command
      entry.args = s.args.split('\n').map((a: string) => a.trim()).filter(Boolean)
      entry.cwd = s.cwd || null  // 空值发 null 让 deepMerge 删除旧值
      entry.url = null
      entry.headers = null
    } else {
      entry.url = s.url
      entry.command = null
      entry.args = null
      entry.cwd = null
      if (s.authHeader && !s.authHeader.startsWith('****')) {
        entry.headers = { Authorization: s.authHeader }
      } else if (!s.authHeader) {
        entry.headers = null
      }
    }
    servers[s.name] = entry
  }

  return {
    payload: Object.keys(servers).length > 0 ? { servers } : null,
    currentNames,
  }
}

// ============ Cloudflare ============
const cf = reactive({
  connected: false,
  configured: false,
  loading: false,
  tokenInput: '',
  error: '',
  zones: [] as { id: string; name: string; status: string }[],
  activeZoneId: null as string | null,
  tokenSource: null as 'inline' | 'env' | 'file' | null,
  // SSL
  sslMode: 'full',
  sslSaving: false,
  sslLoading: false,
  sslMsg: '',
  sslError: false,
  // DNS
  dnsRecords: [] as CfDnsRecord[],
  dnsLoading: false,
  dnsSaving: false,
  dnsDeletingId: null as string | null,
  dnsMsg: '',
  dnsError: false,
  newDns: { type: 'A', name: '', content: '', proxied: true },
})

let cfDnsRequestVersion = 0
let cfSslRequestVersion = 0
let cfSslMutationVersion = 0


const streamHint = computed(() => {
  return config.stream
    ? '回复会实时逐字显示，更适合长内容阅读。'
    : '回复会完整生成后一次性返回，更适合稳定复制。'
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    void requestClose()
  }
}

const overlayCloseArmed = ref(false)

function resetOverlayCloseIntent() {
  overlayCloseArmed.value = false
}

function handleOverlayPointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    overlayCloseArmed.value = false
    return
  }

  overlayCloseArmed.value = true
}

function handleOverlayPointerUp(event: PointerEvent) {
  const shouldClose = event.button === 0 && overlayCloseArmed.value
  overlayCloseArmed.value = false
  if (shouldClose) void requestClose()
}

async function requestClose() {
  if (saving.value) return

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }

  if (dirty.value) {
    await handleSave()
    if (saving.value) return
    if (dirty.value && !saving.value) {
      const confirmedDiscard = window.confirm(
        `${statusText.value || '当前更改尚未成功保存。'}\n\n是否放弃未保存的更改并关闭设置？`,
      )
      if (!confirmedDiscard) return
    }
  }

  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  refreshManagementState()
  unsubscribeManagementToken = subscribeManagementTokenChange(refreshManagementState)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  unsubscribeManagementToken?.()
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
})

// ============ 自动保存 ============
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleAutoSave() {
  if (!configLoaded) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  dirty.value = true
  autoSaveTimer = setTimeout(() => {
    if (saving.value) {
      scheduleAutoSave()
      return
    }
    handleSave()
  }, 1000)
}

watch(
  [
    () => config.systemPrompt,
    () => config.maxToolRounds,
    () => config.stream,
    () => defaultModelName.value,
    () => JSON.stringify(modelEntries.map(entry => ({ modelName: entry.modelName, provider: entry.provider, apiKey: entry.apiKey, modelId: entry.modelId, baseUrl: entry.baseUrl }))),
    // 排除 open（纯 UI 状态）
    () => JSON.stringify(mcpServers, (key, value) => (key === 'open' || key === 'timeoutInput') ? undefined : value),
  ],
  scheduleAutoSave,
)

function loadModelEntriesFromConfig(llm: any) {
  modelEntries.splice(0, modelEntries.length)
  modelOriginalNames.value = []

  if (llm?.models && typeof llm.models === 'object' && !Array.isArray(llm.models)) {
    for (const [name, cfg] of Object.entries(llm.models) as [string, any][]) {
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue
      const provider = typeof cfg.provider === 'string' ? cfg.provider : 'gemini'
      modelEntries.push(createModelEntry(provider, {
        originalModelName: name,
        modelName: name,
        apiKey: cfg.apiKey || '',
        modelId: cfg.model || '',
        baseUrl: cfg.baseUrl || '',
        open: name === llm.defaultModel,
      }))
      modelOriginalNames.value.push(name)
    }
  }

  if (modelEntries.length === 0) {
    modelEntries.push(createModelEntry())
  }

  defaultModelName.value = typeof llm?.defaultModel === 'string' ? llm.defaultModel.trim() : ''
  syncDefaultModelName(modelEntries.map(entry => entry.modelName.trim()))
}

onMounted(async () => {
  try {
    refreshManagementState()
    const data = await getConfig()
    loadModelEntriesFromConfig(data.llm || {})

    config.systemPrompt = data.system?.systemPrompt || ''
    config.maxToolRounds = data.system?.maxToolRounds ?? 10
    syncMaxToolRoundsInput()
    config.stream = data.system?.stream ?? true

    // MCP
    if (data.mcp?.servers && typeof data.mcp.servers === 'object') {
      mcpOriginalNames.value = Object.keys(data.mcp.servers)
      for (const [name, cfg] of Object.entries(data.mcp.servers) as [string, any][]) {
        mcpServers.push({
          name,
          transport: cfg.transport || 'stdio',
          command: cfg.command || '',
          args: Array.isArray(cfg.args) ? cfg.args.join('\n') : '',
          cwd: cfg.cwd || '',
          url: cfg.url || '',
          authHeader: cfg.headers?.Authorization || '',
          timeout: cfg.timeout ?? 30000,
          timeoutInput: String(cfg.timeout ?? 30000),
          enabled: cfg.enabled !== false,
          open: false,
        })
      }
    }

    // 等待 provider watcher 的异步回调执行完毕后再启用副作用
    await nextTick()
    configLoaded = true
    dirty.value = false
    syncMaxToolRoundsInput()
  } catch (err: any) {
    configLoaded = true
    statusText.value = '加载配置失败: ' + (err?.message || '未知错误')
    statusError.value = true
    dirty.value = false
  }
  syncMaxToolRoundsInput()

  try {
    const status = await getStatus()
    tools.value = status.tools || []
    managementEnabled.value = !!status.managementProtected
  } catch {
    tools.value = []
  }
})

function buildModelEntryPayload(entry: ModelEntry): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    provider: entry.provider,
    model: entry.modelId,
    baseUrl: entry.baseUrl,
  }
  if (entry.apiKey && !entry.apiKey.startsWith('****')) {
    payload.apiKey = entry.apiKey
  }
  return payload
}

function validateModelEntries(): string | null {
  if (modelEntries.length === 0) return '至少需要保留一个模型'

  const names = new Set<string>()
  for (const entry of modelEntries) {
    const modelName = entry.modelName.trim()
    if (!modelName) return '模型名称不能为空'
    if (names.has(modelName)) return `模型名称重复：${modelName}`
    if (!entry.modelId.trim()) return `模型「${modelName}」缺少模型 ID`
    names.add(modelName)
  }

  if (!defaultModelName.value.trim()) return '默认模型不能为空'
  if (!names.has(defaultModelName.value.trim())) return `默认模型不存在：${defaultModelName.value}`

  return null
}

function buildLLMPayload(): { payload: Record<string, unknown>; currentNames: string[] } {
  const models: Record<string, unknown> = {}

  for (const originalName of modelOriginalNames.value) {
    if (!modelEntries.some(entry => entry.modelName.trim() === originalName)) {
      models[originalName] = null
    }
  }

  const currentNames: string[] = []
  for (const entry of modelEntries) {
    const modelName = entry.modelName.trim()
    if (!modelName) continue
    currentNames.push(modelName)
    if (entry.originalModelName && entry.originalModelName !== modelName) {
      models[entry.originalModelName] = null
    }
    models[modelName] = buildModelEntryPayload(entry)
  }

  return {
    payload: { defaultModel: defaultModelName.value.trim(), models },
    currentNames,
  }
}

async function handleSave() {
  if (saving.value) return

  saving.value = true
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }

  statusText.value = ''
  statusError.value = false

  const duplicateMcpNames = findDuplicateMcpNames()
  if (duplicateMcpNames.length > 0) {
    statusText.value = `保存失败: MCP 服务器名称重复（${duplicateMcpNames.join('、')}）`
    statusError.value = true
    saving.value = false
    return
  }

  const modelValidationError = validateModelEntries()
  if (modelValidationError) {
    statusText.value = '保存失败: ' + modelValidationError
    statusError.value = true
    saving.value = false
    return
  }

  try {
    const { payload: llmPayload, currentNames: currentModelNames } = buildLLMPayload()

    const { payload: mcpPayload, currentNames } = buildMCPPayload()
    const payload: Record<string, any> = {
      llm: llmPayload,
      system: {
        systemPrompt: config.systemPrompt,
        maxToolRounds: config.maxToolRounds,
        stream: config.stream,
      },
    }
    if (mcpPayload !== null) {
      payload.mcp = mcpPayload
    }
    const result = await updateConfig(payload)

    if (result.ok) {
      statusText.value = result.restartRequired ? '已保存，需要重启生效' : '已保存并生效'
      statusError.value = false
      modelOriginalNames.value = currentModelNames
      mcpOriginalNames.value = currentNames
      dirty.value = false
      for (const entry of modelEntries) {
        entry.originalModelName = entry.modelName.trim()
      }

      // 热重载后刷新工具列表（MCP 开关会影响工具数量）
      try {
        const st = await getStatus()
        tools.value = st.tools || []
      } catch { /* 静默 */ }
    } else {
      statusText.value = '保存失败: ' + (result.error || '未知错误')
      statusError.value = true
      dirty.value = true
    }
  } catch (err: any) {
    statusText.value = '保存失败: ' + err.message
    statusError.value = true
    dirty.value = true
  } finally {
    saving.value = false
  }
}

// ============ Cloudflare 辅助 ============

const sslHints: Record<string, string> = {
  off: '所有连接均不加密，不推荐使用。',
  flexible: '浏览器到 Cloudflare 加密，Cloudflare 到源站不加密。适合源站无证书时临时使用。',
  full: '全程 HTTPS，但不验证源站证书。适合自签名证书场景。',
  strict: '全程 HTTPS 且验证源站证书合法性。推荐生产环境使用。',
}

const dnsNamePlaceholder = computed(() => {
  const m: Record<string, string> = {
    A: '例如：www 或 @ (根域名)',
    AAAA: '例如：www 或 @ (根域名)',
    CNAME: '例如：blog',
    MX: '例如：@ (根域名)',
    TXT: '例如：@ (根域名)',
  }
  return m[cf.newDns.type] || '子域名或 @'
})

const dnsContentPlaceholder = computed(() => {
  const m: Record<string, string> = {
    A: '例如：1.2.3.4 (IPv4 地址)',
    AAAA: '例如：2001:db8::1 (IPv6 地址)',
    CNAME: '例如：example.com',
    MX: '例如：mail.example.com',
    TXT: '例如：v=spf1 include:...',
  }
  return m[cf.newDns.type] || '记录值'
})

const dnsProxySupported = computed(() => ['A', 'AAAA', 'CNAME'].includes(cf.newDns.type))

watch(() => cf.newDns.type, (type) => {
  if (!['A', 'AAAA', 'CNAME'].includes(type)) cf.newDns.proxied = false
})

// ============ Cloudflare 方法 ============

async function loadCfStatus() {
  try {
    const status = await cfGetStatus()
    cf.configured = status.configured
    cf.error = status.error || ''
    cf.connected = status.connected
    cf.zones = status.zones || []
    cf.activeZoneId = status.activeZoneId
    cf.tokenSource = status.tokenSource || null

    // 多 zone 且未指定时，自动选第一个
    if (!cf.activeZoneId && cf.zones.length > 0) {
      cf.activeZoneId = cf.zones[0].id
    }

    if (status.connected) {
      await Promise.all([loadCfDns(), loadCfSsl()])
    } else {
      cfDnsRequestVersion += 1
      cfSslRequestVersion += 1
      cfSslMutationVersion += 1
      cf.dnsRecords = []
      cf.dnsSaving = false
      cf.dnsDeletingId = null
      cf.dnsMsg = ''
      cf.dnsError = false
      cf.sslMode = 'unknown'
      cf.sslSaving = false
      committedSslMode = 'unknown'
      cf.sslLoading = false
      cf.sslMsg = ''
      cf.sslError = false
    }
  } catch (err: any) {
    cfDnsRequestVersion += 1
    cfSslRequestVersion += 1
    cfSslMutationVersion += 1
    cf.connected = false
    cf.error = err?.message || '加载 Cloudflare 状态失败'
    cf.dnsRecords = []
    cf.dnsSaving = false
    cf.dnsDeletingId = null
    cf.sslMode = 'unknown'
    cf.sslSaving = false
    committedSslMode = 'unknown'
    cf.sslLoading = false
  }
}

async function loadCfDns() {
  const requestVersion = ++cfDnsRequestVersion
  const zoneId = cf.activeZoneId
  cf.dnsMsg = ''
  cf.dnsError = false
  cf.dnsLoading = true
  try {
    const result = await cfListDns(zoneId)
    if (requestVersion !== cfDnsRequestVersion) return
    cf.dnsRecords = result.records || []
  } catch (err: any) {
    if (requestVersion !== cfDnsRequestVersion) return
    cf.dnsRecords = []
    cf.dnsMsg = '加载 DNS 记录失败: ' + err.message
    cf.dnsError = true
  } finally {
    if (requestVersion === cfDnsRequestVersion) {
      cf.dnsLoading = false
    }
  }
}

let committedSslMode: CloudflareSslMode = 'full'

async function loadCfSsl() {
  const requestVersion = ++cfSslRequestVersion
  const zoneId = cf.activeZoneId
  cf.sslLoading = true
  cf.sslMsg = ''
  cf.sslError = false
  try {
    const result = await cfGetSsl(zoneId)
    if (requestVersion !== cfSslRequestVersion) return
    cf.sslMode = result.mode || 'full'
    committedSslMode = cf.sslMode
  } catch (err: any) {
    if (requestVersion !== cfSslRequestVersion) return
    cf.sslMode = 'unknown'
    committedSslMode = 'unknown'
    cf.sslMsg = '读取当前 SSL 模式失败：' + (err?.message || '未知错误')
    cf.sslError = true
  } finally {
    if (requestVersion === cfSslRequestVersion) {
      cf.sslLoading = false
    }
  }
}

async function handleCfSetup() {
  if (!cf.tokenInput.trim()) { cf.error = '请输入 Token'; return }
  cf.loading = true
  cf.error = ''
  try {
    const result = await cfSetup(cf.tokenInput.trim())
    if (result.ok) {
      cf.tokenInput = ''
      await loadCfStatus()
    } else {
      cf.error = result.error || '连接失败'
    }
  } catch (err: any) {
    cf.error = err.message
  } finally {
    cf.loading = false
  }
}

async function handleSslChange() {
  if (cf.sslMode === 'unknown' || cf.sslLoading || cf.sslSaving) return
  const requestVersion = ++cfSslMutationVersion
  const zoneId = cf.activeZoneId
  const targetMode = cf.sslMode as CloudflareSslMode
  const previousMode = committedSslMode
  cf.sslMsg = ''
  cf.sslError = false
  cf.sslSaving = true
  try {
    await cfSetSsl(targetMode, zoneId)
    if (requestVersion !== cfSslMutationVersion || zoneId !== cf.activeZoneId) return
    committedSslMode = targetMode
    cf.sslMode = targetMode
    cf.sslMsg = 'SSL 模式已更新'
  } catch (err: any) {
    if (requestVersion !== cfSslMutationVersion) return
    committedSslMode = previousMode
    if (zoneId === cf.activeZoneId) {
      cf.sslMode = previousMode
    }
    cf.sslMsg = '更新失败: ' + err.message
    cf.sslError = true
  } finally {
    if (requestVersion === cfSslMutationVersion) cf.sslSaving = false
  }
}

async function handleDnsAdd() {
  if (cf.dnsSaving || cf.dnsDeletingId) return
  if (!dnsProxySupported.value) cf.newDns.proxied = false
  if (!cf.newDns.name || !cf.newDns.content) { cf.dnsMsg = '名称和内容不能为空'; cf.dnsError = true; return }
  cf.dnsMsg = ''
  cf.dnsError = false
  cf.dnsSaving = true
  try {
    await cfAddDns({ ...cf.newDns }, cf.activeZoneId)
    cf.newDns.name = ''
    cf.newDns.content = ''
    await loadCfDns()
    if (!cf.dnsError) {
      cf.dnsMsg = '添加成功'
    }
  } catch (err: any) {
    cf.dnsMsg = '添加失败: ' + err.message
    cf.dnsError = true
  } finally {
    cf.dnsSaving = false
  }
}

function confirmDnsDelete(rec: CfDnsRecord) {
  if (!confirm(`确认删除 DNS 记录？\n\n${rec.type}  ${rec.name}  →  ${rec.content}`)) return
  handleDnsDelete(rec.id)
}

async function handleDnsDelete(id: string) {
  if (cf.dnsSaving || cf.dnsDeletingId) return
  cf.dnsMsg = ''
  cf.dnsError = false
  cf.dnsDeletingId = id
  try {
    await cfRemoveDns(id, cf.activeZoneId)
    cf.dnsRecords = cf.dnsRecords.filter(r => r.id !== id)
    cf.dnsMsg = '已删除'
  } catch (err: any) {
    cf.dnsMsg = '删除失败: ' + err.message
    cf.dnsError = true
  } finally {
    if (cf.dnsDeletingId === id) {
      cf.dnsDeletingId = null
    }
  }
}

async function handleZoneChange() {
  // 多 zone 场景下切换 zone 后重新加载 DNS 和 SSL
  cf.dnsMsg = ''
  cf.dnsError = false
  cfSslMutationVersion += 1
  cf.sslSaving = false
  cf.sslMsg = ''
  cf.sslError = false
  await Promise.all([loadCfDns(), loadCfSsl()])
}

// 初始化加载 CF 状态
onMounted(() => loadCfStatus())
</script>
