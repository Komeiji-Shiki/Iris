/**
 * 部署管理 API 处理器
 *
 * GET  /api/deploy/detect  — 检测服务器环境（nginx、systemd、sudo）
 * POST /api/deploy/nginx   — 一键部署 nginx 配置
 * POST /api/deploy/service — 一键部署 systemd 服务
 *
 * 安全限制：仅 Linux + localhost 访问
 */

import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { readBody, sendJSON } from '../router';
import { createLogger } from '../../../logger';

const logger = createLogger('Deploy');

// ============ 类型 ============

interface DeployStep {
  name: string;
  success: boolean;
  output: string;
}

interface DeployResponse {
  ok: boolean;
  steps: DeployStep[];
  error?: string;
}

// ============ 工具函数 ============

/** Promise 包装 child_process.exec */
function execCommand(cmd: string, timeout = 30000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { shell: '/bin/sh', timeout }, (err, stdout, stderr) => {
      if (err) {
        reject(Object.assign(err, { stdout, stderr }));
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

/** 启动时生成的一次性部署令牌 */
import * as crypto from 'crypto';
const DEPLOY_TOKEN = crypto.randomBytes(16).toString('hex');

/** 检查部署请求的安全条件：Linux + 令牌验证 */
function assertDeployAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (process.platform !== 'linux') {
    sendJSON(res, 400, { error: '仅支持 Linux 系统' });
    return false;
  }

  const token = req.headers['x-deploy-token'] as string | undefined;
  if (!token || token !== DEPLOY_TOKEN) {
    sendJSON(res, 403, { error: '部署令牌无效。请查看服务端启动日志获取令牌。' });
    return false;
  }

  return true;
}

/** 获取部署令牌（供 detect 接口返回给前端） */
function checkDeployAccess(req: http.IncomingMessage): boolean {
  const token = req.headers['x-deploy-token'] as string | undefined;
  return !!token && token === DEPLOY_TOKEN;
}

/** 生成临时文件路径 */
function tmpFilePath(prefix: string, ext: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return path.join(os.tmpdir(), `${prefix}-${rand}${ext}`);
}

/** 安全清理临时文件 */
function cleanupTmp(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch { /* 忽略 */ }
}

// ============ 处理器工厂 ============

export function createDeployHandlers(_opts: { host: string; port: number }) {
  logger.info(`部署令牌（一键部署需要）: ${DEPLOY_TOKEN}`);
  return {
    /** GET /api/deploy/detect — 检测服务器环境 */
    async detect(req: http.IncomingMessage, res: http.ServerResponse) {
      const isLinux = process.platform === 'linux';

      // 非 Linux 直接返回基本信息
      if (!isLinux) {
        sendJSON(res, 200, {
          isLinux: false,
          nginx: { installed: false, version: '', configDir: '', existingConfig: false },
          systemd: { available: false, existingService: false, serviceStatus: '' },
          sudo: { available: false, noPassword: false },
        });
        return;
      }

      // 检查 localhost
      const remoteAddr = req.socket.remoteAddress ?? '';
      const loopbackAddrs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
      const isLocal = loopbackAddrs.includes(remoteAddr);

      // nginx 检测
      let nginxInstalled = false;
      let nginxVersion = '';
      let configDir = '';
      let existingConfig = false;

      try {
        // nginx -v 输出到 stderr，且正常返回 exit code 0
        const { stderr } = await execCommand('nginx -v');
        const versionMatch = (stderr || '').match(/nginx\/([\d.]+)/);
        if (versionMatch) {
          nginxInstalled = true;
          nginxVersion = versionMatch[1];
        }
      } catch {
        // nginx 未安装（command not found）
      }

      // 检测 nginx 配置目录
      if (fs.existsSync('/etc/nginx/sites-available')) {
        configDir = 'sites-available';
        existingConfig = fs.existsSync('/etc/nginx/sites-available/irisclaw');
      } else if (fs.existsSync('/etc/nginx/conf.d')) {
        configDir = 'conf.d';
        existingConfig = fs.existsSync('/etc/nginx/conf.d/irisclaw.conf');
      }

      // systemd 检测
      let systemdAvailable = false;
      let existingService = false;
      let serviceStatus = '';

      try {
        await execCommand('systemctl --version');
        systemdAvailable = true;
      } catch { /* systemd 不可用 */ }

      if (systemdAvailable) {
        existingService = fs.existsSync('/etc/systemd/system/irisclaw.service');
        if (existingService) {
          try {
            const { stdout } = await execCommand('systemctl is-active irisclaw 2>/dev/null || true');
            serviceStatus = stdout || 'unknown';
          } catch {
            serviceStatus = 'unknown';
          }
        }
      }

      // sudo 检测
      let sudoAvailable = false;
      let sudoNoPassword = false;

      try {
        await execCommand('which sudo');
        sudoAvailable = true;
        try {
          await execCommand('sudo -n true 2>/dev/null');
          sudoNoPassword = true;
        } catch { /* 需要密码 */ }
      } catch { /* sudo 未安装 */ }

      sendJSON(res, 200, {
        isLinux: true,
        isLocal,
        nginx: { installed: nginxInstalled, version: nginxVersion, configDir, existingConfig },
        systemd: { available: systemdAvailable, existingService, serviceStatus },
        sudo: { available: sudoAvailable, noPassword: sudoNoPassword },
      });
    },

    /** POST /api/deploy/nginx — 部署 nginx 配置 */
    async nginx(req: http.IncomingMessage, res: http.ServerResponse) {
      if (!assertDeployAuth(req, res)) return;

      const steps: DeployStep[] = [];
      const body = await readBody(req);
      const config = body?.config;

      if (!config || typeof config !== 'string') {
        sendJSON(res, 400, { error: '缺少 config 字段' });
        return;
      }

      // 检测配置目录布局
      const useSitesAvailable = fs.existsSync('/etc/nginx/sites-available');
      const targetDir = useSitesAvailable ? '/etc/nginx/sites-available' : '/etc/nginx/conf.d';
      const targetFile = useSitesAvailable
        ? `${targetDir}/irisclaw`
        : `${targetDir}/irisclaw.conf`;

      const tmpFile = tmpFilePath('irisclaw-nginx', '.conf');

      try {
        // 步骤1：写入临时文件
        try {
          fs.writeFileSync(tmpFile, config, 'utf-8');
          steps.push({ name: '写入临时配置文件', success: true, output: tmpFile });
        } catch (e: any) {
          steps.push({ name: '写入临时配置文件', success: false, output: e.message });
          sendJSON(res, 200, { ok: false, steps, error: '写入临时文件失败' } as DeployResponse);
          return;
        }

        // 步骤2：复制到 nginx 配置目录
        try {
          const { stdout } = await execCommand(`sudo cp "${tmpFile}" "${targetFile}"`);
          steps.push({ name: `复制到 ${targetFile}`, success: true, output: stdout || '完成' });
        } catch (e: any) {
          steps.push({ name: `复制到 ${targetFile}`, success: false, output: e.stderr || e.message });
          sendJSON(res, 200, { ok: false, steps, error: '复制配置文件失败' } as DeployResponse);
          return;
        }

        // 步骤3：创建软链接（仅 sites-available 布局）
        if (useSitesAvailable) {
          try {
            const linkTarget = '/etc/nginx/sites-enabled/irisclaw';
            const { stdout } = await execCommand(`sudo ln -sf "${targetFile}" "${linkTarget}"`);
            steps.push({ name: '创建 sites-enabled 软链接', success: true, output: stdout || '完成' });
          } catch (e: any) {
            steps.push({ name: '创建 sites-enabled 软链接', success: false, output: e.stderr || e.message });
            // 回滚：删除已复制的配置
            await execCommand(`sudo rm -f "${targetFile}"`).catch(() => {});
            sendJSON(res, 200, { ok: false, steps, error: '创建软链接失败' } as DeployResponse);
            return;
          }
        }

        // 步骤4：测试 nginx 配置
        try {
          const { stdout, stderr } = await execCommand('sudo nginx -t 2>&1');
          steps.push({ name: 'nginx 配置测试', success: true, output: stdout || stderr || '语法正确' });
        } catch (e: any) {
          const output = e.stderr || e.stdout || e.message;
          steps.push({ name: 'nginx 配置测试', success: false, output });
          // 回滚：删除配置文件和软链接
          logger.warn('nginx -t 失败，回滚配置');
          await execCommand(`sudo rm -f "${targetFile}"`).catch(() => {});
          if (useSitesAvailable) {
            await execCommand('sudo rm -f /etc/nginx/sites-enabled/irisclaw').catch(() => {});
          }
          sendJSON(res, 200, { ok: false, steps, error: 'nginx 配置测试失败，已回滚' } as DeployResponse);
          return;
        }

        // 步骤5：重载 nginx
        try {
          const { stdout } = await execCommand('sudo systemctl reload nginx');
          steps.push({ name: '重载 nginx', success: true, output: stdout || '完成' });
        } catch (e: any) {
          steps.push({ name: '重载 nginx', success: false, output: e.stderr || e.message });
          sendJSON(res, 200, { ok: false, steps, error: '重载 nginx 失败' } as DeployResponse);
          return;
        }

        sendJSON(res, 200, { ok: true, steps } as DeployResponse);
      } finally {
        cleanupTmp(tmpFile);
      }
    },

    /** POST /api/deploy/service — 部署 systemd 服务 */
    async service(req: http.IncomingMessage, res: http.ServerResponse) {
      if (!assertDeployAuth(req, res)) return;

      const steps: DeployStep[] = [];
      const body = await readBody(req);
      const config = body?.config;

      if (!config || typeof config !== 'string') {
        sendJSON(res, 400, { error: '缺少 config 字段' });
        return;
      }

      const tmpFile = tmpFilePath('irisclaw-service', '.service');
      const targetFile = '/etc/systemd/system/irisclaw.service';

      try {
        // 步骤1：写入临时文件
        try {
          fs.writeFileSync(tmpFile, config, 'utf-8');
          steps.push({ name: '写入临时服务文件', success: true, output: tmpFile });
        } catch (e: any) {
          steps.push({ name: '写入临时服务文件', success: false, output: e.message });
          sendJSON(res, 200, { ok: false, steps, error: '写入临时文件失败' } as DeployResponse);
          return;
        }

        // 步骤2：复制到 systemd 目录
        try {
          const { stdout } = await execCommand(`sudo cp "${tmpFile}" "${targetFile}"`);
          steps.push({ name: `复制到 ${targetFile}`, success: true, output: stdout || '完成' });
        } catch (e: any) {
          steps.push({ name: `复制到 ${targetFile}`, success: false, output: e.stderr || e.message });
          sendJSON(res, 200, { ok: false, steps, error: '复制服务文件失败' } as DeployResponse);
          return;
        }

        // 步骤3：daemon-reload
        try {
          const { stdout } = await execCommand('sudo systemctl daemon-reload');
          steps.push({ name: 'systemctl daemon-reload', success: true, output: stdout || '完成' });
        } catch (e: any) {
          steps.push({ name: 'systemctl daemon-reload', success: false, output: e.stderr || e.message });
          sendJSON(res, 200, { ok: false, steps, error: 'daemon-reload 失败' } as DeployResponse);
          return;
        }

        // 步骤4：enable 服务
        try {
          const { stdout } = await execCommand('sudo systemctl enable irisclaw');
          steps.push({ name: 'systemctl enable irisclaw', success: true, output: stdout || '完成' });
        } catch (e: any) {
          steps.push({ name: 'systemctl enable irisclaw', success: false, output: e.stderr || e.message });
          sendJSON(res, 200, { ok: false, steps, error: '启用服务失败' } as DeployResponse);
          return;
        }

        // 不自动 start/restart，避免杀掉当前进程
        steps.push({
          name: '提示',
          success: true,
          output: '服务已安装并启用。请手动执行: sudo systemctl restart irisclaw',
        });

        sendJSON(res, 200, { ok: true, steps } as DeployResponse);
      } finally {
        cleanupTmp(tmpFile);
      }
    },
  };
}
