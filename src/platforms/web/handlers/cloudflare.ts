/**
 * Cloudflare 管理 API 处理器
 *
 * GET  /api/cloudflare/status  — 获取连接状态和 zone 列表
 * GET  /api/cloudflare/dns     — 列出 DNS 记录
 * POST /api/cloudflare/dns     — 添加 DNS 记录
 * DELETE /api/cloudflare/dns/:id — 删除 DNS 记录
 * GET  /api/cloudflare/ssl     — 获取 SSL 模式
 * PUT  /api/cloudflare/ssl     — 切换 SSL 模式
 * POST /api/cloudflare/setup   — 首次配置（验证 token 并存入 config）
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { readBody, sendJSON, RouteParams } from '../router';
import { createLogger } from '../../../logger';

const logger = createLogger('Cloudflare');

const CF_API = 'https://api.cloudflare.com/client/v4';

// ============ Cloudflare API 调用 ============

/** 发送请求到 Cloudflare REST API */
function cfFetch(path: string, token: string, options: {
  method?: string;
  body?: unknown;
} = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(CF_API + path);
    const bodyStr = options.body ? JSON.stringify(options.body) : undefined;

    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': String(Buffer.byteLength(bodyStr)) } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf-8');
          const json = JSON.parse(text);
          resolve(json);
        } catch (err) {
          reject(new Error('Cloudflare API 响应解析失败'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Cloudflare API 请求超时'));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** 从 config.yaml 读取 cloudflare 配置 */
function readCfConfig(configPath: string): { apiToken: string; zoneId: string } | null {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const data = parseYAML(raw) ?? {};
    if (!data.cloudflare?.apiToken) return null;
    return {
      apiToken: data.cloudflare.apiToken,
      zoneId: data.cloudflare.zoneId || '',
    };
  } catch {
    return null;
  }
}

/** 从请求 URL 中提取 query 参数 */
function getQueryParam(req: http.IncomingMessage, name: string): string | null {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  return url.searchParams.get(name);
}

/** 获取有效的 zoneId：请求参数 > 配置文件 > 自动检测 */
async function resolveZoneId(token: string, configuredZoneId: string, overrideZoneId?: string | null): Promise<string> {
  if (overrideZoneId) return overrideZoneId;
  if (configuredZoneId && configuredZoneId !== 'auto') return configuredZoneId;
  const result = await cfFetch('/zones', token);
  if (!result.success || !result.result?.length) {
    throw new Error('未找到任何 zone，请检查 API Token 权限');
  }
  if (result.result.length === 1) return result.result[0].id;
  throw new Error('检测到多个 zone，请在请求中指定 zoneId 参数');
}

// ============ 处理器工厂 ============

export function createCloudflareHandlers(configPath: string) {
  return {
    /** GET /api/cloudflare/status — 连接状态 */
    async status(_req: http.IncomingMessage, res: http.ServerResponse) {
      const cfg = readCfConfig(configPath);
      if (!cfg) {
        sendJSON(res, 200, { configured: false, connected: false, zones: [], activeZoneId: null });
        return;
      }
      try {
        // 验证 token
        const verify = await cfFetch('/user/tokens/verify', cfg.apiToken);
        if (!verify.success) {
          sendJSON(res, 200, { configured: true, connected: false, zones: [], activeZoneId: null });
          return;
        }
        // 获取 zone 列表
        const zonesResult = await cfFetch('/zones', cfg.apiToken);
        const zones = (zonesResult.result || []).map((z: any) => ({
          id: z.id, name: z.name, status: z.status,
        }));
        // 确定 activeZoneId
        let activeZoneId: string | null = null;
        if (cfg.zoneId && cfg.zoneId !== 'auto') {
          activeZoneId = cfg.zoneId;
        } else if (zones.length === 1) {
          activeZoneId = zones[0].id;
        }
        sendJSON(res, 200, { configured: true, connected: true, zones, activeZoneId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('Cloudflare 状态检查失败:', msg);
        sendJSON(res, 200, { configured: true, connected: false, zones: [], activeZoneId: null, error: msg });
      }
    },

    /** GET /api/cloudflare/dns — 列出 DNS 记录 */
    async listDns(req: http.IncomingMessage, res: http.ServerResponse) {
      const cfg = readCfConfig(configPath);
      if (!cfg) { sendJSON(res, 400, { error: '未配置 Cloudflare' }); return; }
      try {
        const qZoneId = getQueryParam(req, 'zoneId');
        const zoneId = await resolveZoneId(cfg.apiToken, cfg.zoneId, qZoneId);
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
        const page = url.searchParams.get('page') || '1';
        const perPage = url.searchParams.get('per_page') || '50';
        const result = await cfFetch(`/zones/${zoneId}/dns_records?page=${page}&per_page=${perPage}`, cfg.apiToken);
        if (!result.success) {
          sendJSON(res, 500, { error: result.errors?.[0]?.message || 'DNS 查询失败' });
          return;
        }
        const records = (result.result || []).map((r: any) => ({
          id: r.id, type: r.type, name: r.name,
          content: r.content, proxied: r.proxied, ttl: r.ttl,
        }));
        sendJSON(res, 200, { records });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, 500, { error: msg });
      }
    },

    /** POST /api/cloudflare/dns — 添加 DNS 记录 */
    async addDns(req: http.IncomingMessage, res: http.ServerResponse) {
      const cfg = readCfConfig(configPath);
      if (!cfg) { sendJSON(res, 400, { error: '未配置 Cloudflare' }); return; }
      try {
        const body = await readBody(req);
        const { type, name, content, proxied, ttl, zoneId: bodyZoneId } = body;
        if (!type || !name || !content) {
          sendJSON(res, 400, { error: '缺少必填字段: type, name, content' });
          return;
        }
        const zoneId = await resolveZoneId(cfg.apiToken, cfg.zoneId, bodyZoneId);
        const record: any = { type, name, content };
        if (proxied !== undefined) record.proxied = proxied;
        if (ttl !== undefined) record.ttl = ttl;
        const result = await cfFetch(`/zones/${zoneId}/dns_records`, cfg.apiToken, {
          method: 'POST', body: record,
        });
        if (!result.success) {
          sendJSON(res, 400, { error: result.errors?.[0]?.message || '添加失败' });
          return;
        }
        sendJSON(res, 200, { ok: true, record: result.result });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, 500, { error: msg });
      }
    },

    /** DELETE /api/cloudflare/dns/:id — 删除 DNS 记录 */
    async removeDns(req: http.IncomingMessage, res: http.ServerResponse, params: RouteParams) {
      const cfg = readCfConfig(configPath);
      if (!cfg) { sendJSON(res, 400, { error: '未配置 Cloudflare' }); return; }
      try {
        const recordId = params.id;
        if (!recordId) { sendJSON(res, 400, { error: '缺少记录 ID' }); return; }
        const qZoneId = getQueryParam(req, 'zoneId');
        const zoneId = await resolveZoneId(cfg.apiToken, cfg.zoneId, qZoneId);
        const result = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, cfg.apiToken, {
          method: 'DELETE',
        });
        if (!result.success) {
          sendJSON(res, 400, { error: result.errors?.[0]?.message || '删除失败' });
          return;
        }
        sendJSON(res, 200, { ok: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, 500, { error: msg });
      }
    },

    /** GET /api/cloudflare/ssl — 获取 SSL 模式 */
    async getSsl(req: http.IncomingMessage, res: http.ServerResponse) {
      const cfg = readCfConfig(configPath);
      if (!cfg) { sendJSON(res, 400, { error: '未配置 Cloudflare' }); return; }
      try {
        const qZoneId = getQueryParam(req, 'zoneId');
        const zoneId = await resolveZoneId(cfg.apiToken, cfg.zoneId, qZoneId);
        const result = await cfFetch(`/zones/${zoneId}/settings/ssl`, cfg.apiToken);
        if (!result.success) {
          sendJSON(res, 500, { error: result.errors?.[0]?.message || '获取 SSL 模式失败' });
          return;
        }
        sendJSON(res, 200, { mode: result.result?.value || 'unknown' });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, 500, { error: msg });
      }
    },

    /** PUT /api/cloudflare/ssl — 切换 SSL 模式 */
    async setSsl(req: http.IncomingMessage, res: http.ServerResponse) {
      const cfg = readCfConfig(configPath);
      if (!cfg) { sendJSON(res, 400, { error: '未配置 Cloudflare' }); return; }
      try {
        const body = await readBody(req);
        const { mode, zoneId: bodyZoneId } = body;
        const validModes = ['off', 'flexible', 'full', 'strict'];
        if (!validModes.includes(mode)) {
          sendJSON(res, 400, { error: `无效的 SSL 模式，可选: ${validModes.join(', ')}` });
          return;
        }
        const zoneId = await resolveZoneId(cfg.apiToken, cfg.zoneId, bodyZoneId);
        const result = await cfFetch(`/zones/${zoneId}/settings/ssl`, cfg.apiToken, {
          method: 'PATCH', body: { value: mode },
        });
        if (!result.success) {
          sendJSON(res, 400, { error: result.errors?.[0]?.message || '设置 SSL 模式失败' });
          return;
        }
        sendJSON(res, 200, { ok: true, mode: result.result?.value });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, 500, { error: msg });
      }
    },

    /** POST /api/cloudflare/setup — 首次配置 */
    async setup(req: http.IncomingMessage, res: http.ServerResponse) {
      try {
        const body = await readBody(req);
        const { apiToken } = body;
        if (!apiToken || typeof apiToken !== 'string') {
          sendJSON(res, 400, { error: '请提供 API Token' });
          return;
        }
        // 验证 token 有效性
        const verify = await cfFetch('/user/tokens/verify', apiToken);
        if (!verify.success) {
          sendJSON(res, 400, { ok: false, error: 'Token 验证失败: ' + (verify.errors?.[0]?.message || '无效的 Token') });
          return;
        }
        // 获取 zone 列表
        const zonesResult = await cfFetch('/zones', apiToken);
        const zones = (zonesResult.result || []).map((z: any) => ({
          id: z.id, name: z.name,
        }));
        // 写入 config.yaml
        const raw = fs.readFileSync(configPath, 'utf-8');
        const data = parseYAML(raw) ?? {};
        data.cloudflare = {
          apiToken,
          zoneId: zones.length === 1 ? zones[0].id : 'auto',
        };
        fs.writeFileSync(configPath, stringifyYAML(data, { indent: 2 }), 'utf-8');
        logger.info('Cloudflare 配置已保存');
        sendJSON(res, 200, { ok: true, zones });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('Cloudflare 配置失败:', msg);
        sendJSON(res, 500, { ok: false, error: msg });
      }
    },
  };
}
