/**
 * API 客户端
 *
 * 封装 REST 调用和 SSE 聊天流解析。
 */

import type {
  Message, StatusInfo, ChatCallbacks, DetectResponse, DeployResponse,
  CfStatusResponse, CfDnsRecord, CfDnsInput, CfSetupResponse,
} from './types'

// ============ 通用 ============

/** 发送请求并检查响应状态 */
async function request(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res
}

// ============ REST ============

export async function getSessions(): Promise<{ sessions: string[] }> {
  const res = await request('/api/sessions')
  return res.json()
}

export async function getMessages(sessionId: string): Promise<{ messages: Message[] }> {
  const res = await request(`/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  return res.json()
}

export async function deleteSession(sessionId: string): Promise<void> {
  await request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

export async function getStatus(): Promise<StatusInfo> {
  const res = await request('/api/status')
  return res.json()
}

export async function getConfig(): Promise<any> {
  const res = await request('/api/config')
  return res.json()
}

export async function updateConfig(data: any): Promise<{ ok: boolean; restartRequired?: boolean; error?: string }> {
  const res = await request('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

// ============ 部署 ============

export async function detectDeploy(): Promise<DetectResponse> {
  const res = await request('/api/deploy/detect')
  return res.json()
}

export async function deployNginx(config: string, token: string): Promise<DeployResponse> {
  const res = await request('/api/deploy/nginx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Deploy-Token': token },
    body: JSON.stringify({ config }),
  })
  return res.json()
}

export async function deployService(config: string, token: string): Promise<DeployResponse> {
  const res = await request('/api/deploy/service', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Deploy-Token': token },
    body: JSON.stringify({ config }),
  })
  return res.json()
}

// ============ Cloudflare ============

export async function cfGetStatus(): Promise<CfStatusResponse> {
  const res = await request('/api/cloudflare/status')
  return res.json()
}

export async function cfListDns(zoneId?: string | null): Promise<{ records: CfDnsRecord[] }> {
  const q = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : ''
  const res = await request(`/api/cloudflare/dns${q}`)
  return res.json()
}

export async function cfAddDns(record: CfDnsInput, zoneId?: string | null): Promise<any> {
  const res = await request('/api/cloudflare/dns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...record, zoneId }),
  })
  return res.json()
}

export async function cfRemoveDns(id: string, zoneId?: string | null): Promise<any> {
  const q = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : ''
  const res = await request(`/api/cloudflare/dns/${encodeURIComponent(id)}${q}`, { method: 'DELETE' })
  return res.json()
}

export async function cfGetSsl(zoneId?: string | null): Promise<{ mode: string }> {
  const q = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : ''
  const res = await request(`/api/cloudflare/ssl${q}`)
  return res.json()
}

export async function cfSetSsl(mode: string, zoneId?: string | null): Promise<any> {
  const res = await request('/api/cloudflare/ssl', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, zoneId }),
  })
  return res.json()
}

export async function cfSetup(apiToken: string): Promise<CfSetupResponse> {
  const res = await request('/api/cloudflare/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiToken }),
  })
  return res.json()
}

// ============ SSE 聊天 ============

/**
 * 发送聊天消息并通过 SSE 接收响应。
 * 使用 fetch + ReadableStream 手动解析（EventSource 不支持 POST）。
 */
export function sendChat(sessionId: string | null, message: string, callbacks: ChatCallbacks): AbortController {
  const controller = new AbortController()

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: '请求失败' }))
      callbacks.onError?.(err.error || `HTTP ${response.status}`)
      return
    }

    // 获取服务端分配的 sessionId
    const actualSessionId = response.headers.get('X-Session-Id')
    if (actualSessionId) callbacks.onSessionId?.(actualSessionId)

    // 手动解析 SSE 流
    if (!response.body) {
      callbacks.onError?.('响应体为空')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6))
            switch (event.type) {
              case 'delta': callbacks.onDelta?.(event.text); break
              case 'message': callbacks.onMessage?.(event.text); break
              case 'stream_end': callbacks.onStreamEnd?.(); break
              case 'done': callbacks.onDone?.(); break
              case 'error': callbacks.onError?.(event.message); break
            }
          } catch { /* 忽略解析错误（如心跳） */ }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') callbacks.onError?.(err.message)
  })

  return controller
}
