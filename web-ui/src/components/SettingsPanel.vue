<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="settings-panel">
      <div class="settings-header">
        <div class="settings-title-group">
          <span class="settings-kicker">Control Center</span>
          <h2>设置中心</h2>
          <p>配置模型连接、系统策略与工具能力，打造你的 AI 工作台。</p>
        </div>
        <button class="btn-close" type="button" aria-label="关闭设置" @click="emit('close')">
          ×
        </button>
      </div>

      <div class="settings-body">
        <section class="settings-section">
          <div class="settings-section-head">
            <div>
              <h3>模型与凭证</h3>
              <p>选择提供商并维护访问凭证。</p>
            </div>
            <span class="settings-pill">LLM</span>
          </div>

          <div class="settings-grid two-columns">
            <div class="form-group">
              <label>LLM 提供商</label>
              <select v-model="config.provider">
                <option value="gemini">Gemini</option>
                <option value="openai-compatible">OpenAI 兼容</option>
                <option value="claude">Claude</option>
              </select>
            </div>

            <div class="form-group">
              <label>模型</label>
              <input type="text" v-model="config.model" placeholder="例如：gemini-2.0-flash" />
            </div>

            <div class="form-group full-width">
              <label>API Key</label>
              <input type="password" v-model="config.apiKey" placeholder="输入或保留已有密钥" />
              <p class="field-hint">{{ apiKeyHint }}</p>
            </div>

            <div class="form-group full-width">
              <label>API 地址</label>
              <input type="text" v-model="config.baseUrl" placeholder="模型服务请求地址" />
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
              <input type="number" v-model.number="config.maxToolRounds" min="1" max="50" />
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
          </div>
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
              <select v-model="cf.activeZoneId" @change="handleZoneChange">
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
                <select v-model="cf.sslMode" @change="handleSslChange">
                  <option value="off">Off — 不加密</option>
                  <option value="flexible">Flexible — 浏览器到 CF 加密</option>
                  <option value="full">Full — 全程加密（不验证源站证书）</option>
                  <option value="strict">Full (Strict) — 全程加密 + 验证源站证书</option>
                </select>
                <p class="field-hint">{{ sslHints[cf.sslMode] || '' }}</p>
                <p v-if="cf.sslMode === 'full' || cf.sslMode === 'strict'" class="field-hint" style="margin-top:4px;color:var(--accent-cyan, var(--accent))">
                  需要 Nginx 开启 HTTPS（443 端口 + SSL 证书），否则 CF 到源站连接会失败（521/525）。
                </p>
                <p v-if="cf.sslMode === 'flexible'" class="field-hint" style="margin-top:4px;color:var(--accent-cyan, var(--accent))">
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
                  <button class="btn-dns-delete" type="button" @click="confirmDnsDelete(rec)" title="删除">×</button>
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
                  <input type="checkbox" v-model="cf.newDns.proxied" /> CDN 代理
                </label>
                <button class="btn-save" type="button" style="padding:6px 14px;font-size:0.8rem" @click="handleDnsAdd">
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
          <button class="btn-save" type="button" :disabled="saving" @click="handleSave">
            {{ saving ? '保存中...' : '保存配置' }}
          </button>
          <span v-if="statusText" class="settings-status" :class="{ error: statusError }">
            {{ statusText }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { getConfig, updateConfig, getStatus, cfGetStatus, cfSetup, cfListDns, cfAddDns, cfRemoveDns, cfGetSsl, cfSetSsl } from '../api/client'
import type { CfDnsRecord } from '../api/types'

const emit = defineEmits<{ close: [] }>()

const config = reactive({
  provider: 'gemini',
  apiKey: '',
  model: '',
  baseUrl: '',
  systemPrompt: '',
  maxToolRounds: 10,
  stream: true,
})

const tools = ref<string[]>([])
const statusText = ref('')
const statusError = ref(false)
const saving = ref(false)

// ============ Cloudflare ============
const cf = reactive({
  connected: false,
  configured: false,
  loading: false,
  tokenInput: '',
  error: '',
  zones: [] as { id: string; name: string; status: string }[],
  activeZoneId: null as string | null,
  // SSL
  sslMode: 'full',
  sslMsg: '',
  sslError: false,
  // DNS
  dnsRecords: [] as CfDnsRecord[],
  dnsLoading: false,
  dnsMsg: '',
  dnsError: false,
  newDns: { type: 'A', name: '', content: '', proxied: true },
})

const apiKeyHint = computed(() => {
  if (!config.apiKey) return '未配置 API Key。'
  if (config.apiKey.startsWith('****')) return '已读取已保存密钥，保持不变则不会覆盖。'
  return '将使用当前输入的密钥保存配置。'
})

const streamHint = computed(() => {
  return config.stream
    ? '回复会实时逐字显示，更适合长内容阅读。'
    : '回复会完整生成后一次性返回，更适合稳定复制。'
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

onMounted(async () => {
  try {
    const data = await getConfig()
    config.provider = data.llm?.provider || 'gemini'
    config.apiKey = data.llm?.apiKey || ''
    config.model = data.llm?.model || ''
    config.baseUrl = data.llm?.baseUrl || ''
    config.systemPrompt = data.system?.systemPrompt || ''
    config.maxToolRounds = data.system?.maxToolRounds || 10
    config.stream = data.system?.stream ?? true
  } catch {
    statusText.value = '加载配置失败'
    statusError.value = true
  }

  try {
    const status = await getStatus()
    tools.value = status.tools || []
  } catch {
    tools.value = []
  }
})

async function handleSave() {
  if (saving.value) return

  saving.value = true
  statusText.value = ''
  statusError.value = false

  try {
    const result = await updateConfig({
      llm: {
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      },
      system: {
        systemPrompt: config.systemPrompt,
        maxToolRounds: config.maxToolRounds,
        stream: config.stream,
      },
    })

    if (result.ok) {
      statusText.value = result.restartRequired ? '已保存，需要重启生效' : '已保存'
      statusError.value = false
    } else {
      statusText.value = '保存失败: ' + (result.error || '未知错误')
      statusError.value = true
    }
  } catch (err: any) {
    statusText.value = '保存失败: ' + err.message
    statusError.value = true
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

// ============ Cloudflare 方法 ============

async function loadCfStatus() {
  try {
    const status = await cfGetStatus()
    cf.configured = status.configured
    cf.connected = status.connected
    cf.zones = status.zones || []
    cf.activeZoneId = status.activeZoneId
    // 多 zone 且未指定时，自动选第一个
    if (!cf.activeZoneId && cf.zones.length > 0) {
      cf.activeZoneId = cf.zones[0].id
    }
    if (status.connected) {
      await Promise.all([loadCfDns(), loadCfSsl()])
    }
  } catch {
    cf.connected = false
  }
}

async function loadCfDns() {
  cf.dnsLoading = true
  try {
    const result = await cfListDns(cf.activeZoneId)
    cf.dnsRecords = result.records || []
  } catch (err: any) {
    cf.dnsMsg = '加载 DNS 记录失败: ' + err.message
    cf.dnsError = true
  } finally {
    cf.dnsLoading = false
  }
}

async function loadCfSsl() {
  try {
    const result = await cfGetSsl(cf.activeZoneId)
    cf.sslMode = result.mode || 'full'
  } catch { /* 静默 */ }
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
  cf.sslMsg = ''
  cf.sslError = false
  try {
    await cfSetSsl(cf.sslMode, cf.activeZoneId)
    cf.sslMsg = 'SSL 模式已更新'
  } catch (err: any) {
    cf.sslMsg = '更新失败: ' + err.message
    cf.sslError = true
  }
}

async function handleDnsAdd() {
  if (!cf.newDns.name || !cf.newDns.content) { cf.dnsMsg = '名称和内容不能为空'; cf.dnsError = true; return }
  cf.dnsMsg = ''
  cf.dnsError = false
  try {
    await cfAddDns({ ...cf.newDns }, cf.activeZoneId)
    cf.newDns.name = ''
    cf.newDns.content = ''
    cf.dnsMsg = '添加成功'
    await loadCfDns()
  } catch (err: any) {
    cf.dnsMsg = '添加失败: ' + err.message
    cf.dnsError = true
  }
}

function confirmDnsDelete(rec: CfDnsRecord) {
  if (!confirm(`确认删除 DNS 记录？\n\n${rec.type}  ${rec.name}  →  ${rec.content}`)) return
  handleDnsDelete(rec.id)
}

async function handleDnsDelete(id: string) {
  cf.dnsMsg = ''
  cf.dnsError = false
  try {
    await cfRemoveDns(id, cf.activeZoneId)
    cf.dnsRecords = cf.dnsRecords.filter(r => r.id !== id)
    cf.dnsMsg = '已删除'
  } catch (err: any) {
    cf.dnsMsg = '删除失败: ' + err.message
    cf.dnsError = true
  }
}

async function handleZoneChange() {
  // 多 zone 场景下切换 zone 后重新加载 DNS 和 SSL
  await Promise.all([loadCfDns(), loadCfSsl()])
}

// 初始化加载 CF 状态
onMounted(() => loadCfStatus())
</script>
