/**
 * 配置管理 API 处理器
 *
 * GET /api/config — 读取配置（敏感字段脱敏）
 * PUT /api/config — 更新配置并尝试热重载
 */

import * as http from 'http';
import { readBody, sendJSON } from '../router';
import { readEditableConfig, updateEditableConfig } from '../../../config/manage';

export function createConfigHandlers(configDir: string, onReload?: (mergedConfig: any) => void | Promise<void>) {
  return {
    /** GET /api/config */
    async get(_req: http.IncomingMessage, res: http.ServerResponse) {
      try {
        sendJSON(res, 200, readEditableConfig(configDir));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, 500, { error: `读取配置失败: ${msg}` });
      }
    },

    /** PUT /api/config */
    async update(req: http.IncomingMessage, res: http.ServerResponse) {
      try {
        const updates = await readBody(req);
        const { mergedRaw } = updateEditableConfig(configDir, updates);

        let reloaded = false;
        if (onReload) {
          try {
            await onReload(mergedRaw);
            reloaded = true;
          } catch {
            // 热重载失败时回退为需要重启
          }
        }

        sendJSON(res, 200, { ok: true, restartRequired: !reloaded });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, 500, { error: `更新配置失败: ${msg}` });
      }
    },
  };
}
