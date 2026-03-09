/** 消息内容部分 */
export interface MessagePart {
  type: 'text' | 'function_call' | 'function_response'
  text?: string
  name?: string
  args?: unknown
  response?: unknown
}

/** 一条完整消息 */
export interface Message {
  role: 'user' | 'model'
  parts: MessagePart[]
}

/** 系统状态 */
export interface StatusInfo {
  provider: string
  model: string
  tools: string[]
  stream: boolean
  platform: string
}

/** 部署环境检测结果 */
export interface DetectResponse {
  isLinux: boolean
  isLocal?: boolean
  nginx: {
    installed: boolean
    version: string
    configDir: string
    existingConfig: boolean
  }
  systemd: {
    available: boolean
    existingService: boolean
    serviceStatus: string
  }
  sudo: {
    available: boolean
    noPassword: boolean
  }
}

/** 部署步骤结果 */
export interface DeployStep {
  name: string
  success: boolean
  output: string
}

/** 部署操作响应 */
export interface DeployResponse {
  ok: boolean
  steps: DeployStep[]
  error?: string
}

// ============ Cloudflare ============

export interface CfStatusResponse {
  configured: boolean
  connected: boolean
  zones: { id: string; name: string; status: string }[]
  activeZoneId: string | null
  error?: string
}

export interface CfDnsRecord {
  id: string
  type: string
  name: string
  content: string
  proxied: boolean
  ttl: number
}

export interface CfDnsInput {
  type: string
  name: string
  content: string
  proxied?: boolean
  ttl?: number
}

export interface CfSetupResponse {
  ok: boolean
  error?: string
  zones: { id: string; name: string }[]
}

/** SSE 聊天回调 */
export interface ChatCallbacks {
  onDelta?: (text: string) => void
  onMessage?: (text: string) => void
  onStreamEnd?: () => void
  onDone?: () => void
  onError?: (message: string) => void
  onSessionId?: (id: string) => void
}
