/**
 * TUI 设置中心
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Gradient from 'ink-gradient';
import TextInput from 'ink-text-input';
import type { MCPServerInfo } from '../../../mcp';
import {
  applyTierProviderChange,
  cloneConsoleSettingsSnapshot,
  CONSOLE_LLM_PROVIDER_OPTIONS,
  CONSOLE_MCP_TRANSPORT_OPTIONS,
  ConsoleLLMProvider,
  ConsoleMCPTransport,
  ConsoleSettingsSaveResult,
  ConsoleSettingsSnapshot,
  ConsoleTierName,
  createDefaultMCPServerEntry,
} from '../settings';

type SettingsSection = 'general' | 'mcp' | 'tools';
type StatusKind = 'info' | 'success' | 'warning' | 'error';

type RowTarget =
  | { kind: 'tierProvider'; tier: ConsoleTierName }
  | { kind: 'tierField'; tier: ConsoleTierName; field: 'model' | 'apiKey' | 'baseUrl' }
  | { kind: 'tierEnabled'; tier: Exclude<ConsoleTierName, 'primary'> }
  | { kind: 'systemField'; field: 'systemPrompt' | 'maxToolRounds' | 'stream' }
  | { kind: 'mcpField'; serverIndex: number; field: 'name' | 'enabled' | 'transport' | 'command' | 'args' | 'cwd' | 'url' | 'authHeader' | 'timeout' }
  | { kind: 'action'; action: 'addMcp' };

interface SettingsRow {
  id: string;
  kind: 'section' | 'field' | 'info' | 'action';
  section: SettingsSection;
  label: string;
  value?: string;
  description?: string;
  target?: RowTarget;
  indent?: number;
}

interface EditorState {
  target: Extract<RowTarget, { kind: 'tierField' | 'systemField' | 'mcpField' }>;
  label: string;
  value: string;
  hint?: string;
}

interface SettingsViewProps {
  initialSection?: 'general' | 'mcp';
  onBack: () => void;
  onLoad: () => Promise<ConsoleSettingsSnapshot>;
  onSave: (snapshot: ConsoleSettingsSnapshot) => Promise<ConsoleSettingsSaveResult>;
}

function getStatusColor(kind: StatusKind): string {
  switch (kind) {
    case 'success': return 'green';
    case 'warning': return 'yellow';
    case 'error': return 'red';
    default: return 'gray';
  }
}

function boolText(value: boolean): string {
  return value ? '开启' : '关闭';
}

function transportLabel(value: ConsoleMCPTransport): string {
  if (value === 'stdio') return 'stdio（本地进程）';
  if (value === 'sse') return 'sse（远程事件流）';
  return 'streamable-http（远程 HTTP）';
}

function previewText(value: string, maxLength: number): string {
  if (!value) return '(空)';
  const normalized = value.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').filter(Boolean);
  const firstLine = lines[0] ?? '';
  const compact = firstLine.length > maxLength
    ? `${firstLine.slice(0, Math.max(1, maxLength - 1))}…`
    : firstLine;

  if (lines.length <= 1) {
    return compact || '(空)';
  }

  return `${lines.length} 行 · ${compact}`;
}

function wrapList(items: string[], maxWidth: number): string[] {
  if (items.length === 0) return ['无已注册工具'];

  const lines: string[] = [];
  let current = '';

  for (const item of items) {
    const next = current ? `${current}  ${item}` : item;
    if (next.length > maxWidth && current) {
      lines.push(current);
      current = item;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function getEditableFingerprint(snapshot: ConsoleSettingsSnapshot | null): string {
  if (!snapshot) return '';
  return JSON.stringify({
    tiers: snapshot.tiers,
    tierEnabled: snapshot.tierEnabled,
    system: snapshot.system,
    mcpServers: snapshot.mcpServers,
    mcpOriginalNames: snapshot.mcpOriginalNames,
  });
}

function escapeMultilineForInput(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n/g, '\\n');
}

function restoreMultilineFromInput(value: string): string {
  return value.replace(/\\n/g, '\n');
}

function cycleValue<T extends string>(values: readonly T[], current: T, direction: 1 | -1): T {
  const currentIndex = values.indexOf(current);
  const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (normalizedIndex + direction + values.length) % values.length;
  return values[nextIndex];
}

function buildRows(snapshot: ConsoleSettingsSnapshot, termWidth: number): SettingsRow[] {
  const rows: SettingsRow[] = [];
  const maxPreview = Math.max(18, termWidth - 38);
  const statusMap = new Map<string, MCPServerInfo>();

  for (const info of snapshot.mcpStatus) {
    statusMap.set(info.name, info);
  }

  const pushField = (
    id: string,
    section: SettingsSection,
    label: string,
    value: string,
    target: RowTarget,
    description?: string,
    indent = 2,
  ) => {
    rows.push({ id, kind: 'field', section, label, value, target, description, indent });
  };

  rows.push({
    id: 'section.general',
    kind: 'section',
    section: 'general',
    label: '模型与系统',
    description: '管理 LLM 三层路由、系统提示词、工具轮次与流式输出。',
  });

  pushField(
    'tier.primary.provider',
    'general',
    'Primary / Provider',
    snapshot.tiers.primary.provider,
    { kind: 'tierProvider', tier: 'primary' },
    '左右方向键切换 Provider；切换后会按默认值补齐 model/baseUrl。',
  );
  pushField(
    'tier.primary.model',
    'general',
    'Primary / Model',
    snapshot.tiers.primary.model || '(空)',
    { kind: 'tierField', tier: 'primary', field: 'model' },
    '回车编辑模型名。',
  );
  pushField(
    'tier.primary.apiKey',
    'general',
    'Primary / API Key',
    snapshot.tiers.primary.apiKey || '未配置',
    { kind: 'tierField', tier: 'primary', field: 'apiKey' },
    '掩码值表示已读取已保存密钥；保持不变不会覆盖。',
  );
  pushField(
    'tier.primary.baseUrl',
    'general',
    'Primary / Base URL',
    snapshot.tiers.primary.baseUrl || '(空)',
    { kind: 'tierField', tier: 'primary', field: 'baseUrl' },
    '回车编辑服务地址。',
  );

  for (const tierName of ['secondary', 'light'] as const) {
    pushField(
      `tier.${tierName}.enabled`,
      'general',
      `${tierName[0].toUpperCase()}${tierName.slice(1)} / Enabled`,
      boolText(snapshot.tierEnabled[tierName]),
      { kind: 'tierEnabled', tier: tierName },
      '空格切换启用状态；启用后才会参与路由。',
    );

    if (snapshot.tierEnabled[tierName]) {
      const tier = snapshot.tiers[tierName];
      pushField(
        `tier.${tierName}.provider`,
        'general',
        `${tierName[0].toUpperCase()}${tierName.slice(1)} / Provider`,
        tier.provider,
        { kind: 'tierProvider', tier: tierName },
        '左右方向键切换 Provider。',
      );
      pushField(
        `tier.${tierName}.model`,
        'general',
        `${tierName[0].toUpperCase()}${tierName.slice(1)} / Model`,
        tier.model || '(空)',
        { kind: 'tierField', tier: tierName, field: 'model' },
      );
      pushField(
        `tier.${tierName}.apiKey`,
        'general',
        `${tierName[0].toUpperCase()}${tierName.slice(1)} / API Key`,
        tier.apiKey || '未配置',
        { kind: 'tierField', tier: tierName, field: 'apiKey' },
        '掩码值不会在保存时覆盖原密钥。',
      );
      pushField(
        `tier.${tierName}.baseUrl`,
        'general',
        `${tierName[0].toUpperCase()}${tierName.slice(1)} / Base URL`,
        tier.baseUrl || '(空)',
        { kind: 'tierField', tier: tierName, field: 'baseUrl' },
      );
    }
  }

  pushField(
    'system.systemPrompt',
    'general',
    'System / Prompt',
    previewText(snapshot.system.systemPrompt, maxPreview),
    { kind: 'systemField', field: 'systemPrompt' },
    '回车编辑；在输入框中使用 \\n 表示换行。留空会回退默认系统提示词。',
  );
  pushField(
    'system.maxToolRounds',
    'general',
    'System / Max Tool Rounds',
    String(snapshot.system.maxToolRounds),
    { kind: 'systemField', field: 'maxToolRounds' },
    '工具循环的最大轮次数。',
  );
  pushField(
    'system.stream',
    'general',
    'System / Stream Output',
    boolText(snapshot.system.stream),
    { kind: 'systemField', field: 'stream' },
    '空格切换流式输出。',
  );

  rows.push({
    id: 'section.tools',
    kind: 'section',
    section: 'tools',
    label: `工具状态（${snapshot.tools.length}）`,
    description: '当前挂载到模型上下文的工具集合。',
  });

  const toolLines = wrapList(snapshot.tools, Math.max(20, termWidth - 10));
  toolLines.forEach((line, index) => {
    rows.push({
      id: `tools.${index}`,
      kind: 'info',
      section: 'tools',
      label: line,
      indent: 2,
    });
  });

  rows.push({
    id: 'section.mcp',
    kind: 'section',
    section: 'mcp',
    label: `MCP 服务器（${snapshot.mcpServers.length}）`,
    description: '管理外部 MCP 服务器；保存后会重新连接并刷新工具列表。',
  });

  rows.push({
    id: 'mcp.add',
    kind: 'action',
    section: 'mcp',
    label: '新增 MCP 服务器',
    value: 'Enter / A',
    target: { kind: 'action', action: 'addMcp' },
    description: '创建新的 MCP 服务器草稿。',
    indent: 2,
  });

  if (snapshot.mcpServers.length === 0) {
    rows.push({
      id: 'mcp.empty',
      kind: 'info',
      section: 'mcp',
      label: '暂无 MCP 服务器，按 Enter 或 A 新建。',
      indent: 4,
    });
  }

  snapshot.mcpServers.forEach((server, index) => {
    const status = server.enabled === false
      ? { name: server.name, status: 'disabled', toolCount: 0, error: undefined as string | undefined }
      : statusMap.get(server.originalName ?? server.name) ?? statusMap.get(server.name);
    const errorText = status && 'error' in status ? status.error : undefined;

    const summary = status
      ? `${server.name || `server_${index + 1}`} · ${server.enabled ? '启用' : '禁用'} · ${transportLabel(server.transport)} · ${status.status}${errorText ? ` · ${errorText}` : ` · ${status.toolCount} tools`}`
      : `${server.name || `server_${index + 1}`} · ${server.enabled ? '未应用' : '禁用'} · ${transportLabel(server.transport)}`;

    rows.push({
      id: `mcp.${index}.summary`,
      kind: 'info',
      section: 'mcp',
      label: summary,
      indent: 4,
    });

    pushField(
      `mcp.${index}.name`,
      'mcp',
      '名称',
      server.name || '(空)',
      { kind: 'mcpField', serverIndex: index, field: 'name' },
      '仅允许字母、数字和下划线；按 D 删除当前服务器草稿。',
      6,
    );
    pushField(
      `mcp.${index}.enabled`,
      'mcp',
      '启用',
      boolText(server.enabled),
      { kind: 'mcpField', serverIndex: index, field: 'enabled' },
      '空格切换启用状态。',
      6,
    );
    pushField(
      `mcp.${index}.transport`,
      'mcp',
      '传输',
      transportLabel(server.transport),
      { kind: 'mcpField', serverIndex: index, field: 'transport' },
      '左右方向键切换 stdio / sse / streamable-http。',
      6,
    );

    if (server.transport === 'stdio') {
      pushField(
        `mcp.${index}.command`,
        'mcp',
        '命令',
        server.command || '(空)',
        { kind: 'mcpField', serverIndex: index, field: 'command' },
        '例如 npx。',
        6,
      );
      pushField(
        `mcp.${index}.cwd`,
        'mcp',
        '工作目录',
        server.cwd || '(空)',
        { kind: 'mcpField', serverIndex: index, field: 'cwd' },
        '可选。',
        6,
      );
      pushField(
        `mcp.${index}.args`,
        'mcp',
        '参数',
        previewText(server.args, maxPreview),
        { kind: 'mcpField', serverIndex: index, field: 'args' },
        '回车编辑；在输入框中使用 \\n 表示多行参数。',
        6,
      );
    } else {
      pushField(
        `mcp.${index}.url`,
        'mcp',
        'URL',
        server.url || '(空)',
        { kind: 'mcpField', serverIndex: index, field: 'url' },
        '远程 MCP 服务地址。',
        6,
      );
      pushField(
        `mcp.${index}.authHeader`,
        'mcp',
        'Authorization',
        server.authHeader || '(空)',
        { kind: 'mcpField', serverIndex: index, field: 'authHeader' },
        '掩码值保持不变时不会覆盖；留空可删除旧值。',
        6,
      );
    }

    pushField(
      `mcp.${index}.timeout`,
      'mcp',
      '超时（ms）',
      String(server.timeout),
      { kind: 'mcpField', serverIndex: index, field: 'timeout' },
      '连接与 listTools 的超时时间。',
      6,
    );
  });

  return rows;
}

export function SettingsView({ initialSection = 'general', onBack, onLoad, onSave }: SettingsViewProps) {
  const { stdout } = useStdout();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ConsoleSettingsSnapshot | null>(null);
  const [baseline, setBaseline] = useState<ConsoleSettingsSnapshot | null>(null);
  const [selectedRowId, setSelectedRowId] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [statusText, setStatusText] = useState('');
  const [statusKind, setStatusKind] = useState<StatusKind>('info');
  const [pendingLeaveConfirm, setPendingLeaveConfirm] = useState(false);

  const termWidth = stdout?.columns ?? 80;
  const termHeight = stdout?.rows ?? 24;

  const setStatus = useCallback((text: string, kind: StatusKind = 'info') => {
    setStatusText(text);
    setStatusKind(kind);
  }, []);

  const isDirty = useMemo(() => {
    return getEditableFingerprint(draft) !== getEditableFingerprint(baseline);
  }, [draft, baseline]);

  const rows = useMemo(() => {
    if (!draft) return [] as SettingsRow[];
    return buildRows(draft, termWidth);
  }, [draft, termWidth]);

  const selectableRows = useMemo(() => rows.filter((row: SettingsRow) => row.target), [rows]);
  const selectedRow = useMemo(() => rows.find((row: SettingsRow) => row.id === selectedRowId), [rows, selectedRowId]);
  const selectedSelectableIndex = useMemo(() => {
    return selectableRows.findIndex((row: SettingsRow) => row.id === selectedRowId);
  }, [selectableRows, selectedRowId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const snapshot = await onLoad();
        if (cancelled) return;
        const cloned = cloneConsoleSettingsSnapshot(snapshot);
        setDraft(cloned);
        setBaseline(cloneConsoleSettingsSnapshot(snapshot));
        setStatus('已加载当前配置', 'success');
        setPendingLeaveConfirm(false);
      } catch (err: unknown) {
        if (cancelled) return;
        setStatus(`加载配置失败：${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [onLoad, setStatus]);

  useEffect(() => {
    if (rows.length === 0) return;
    if (selectedRowId && rows.some((row: SettingsRow) => row.id === selectedRowId && row.target)) return;

    const preferred = rows.find((row: SettingsRow) => row.section === initialSection && row.target)
      ?? rows.find((row: SettingsRow) => row.target);

    if (preferred) {
      setSelectedRowId(preferred.id);
    }
  }, [rows, selectedRowId, initialSection]);

  const updateDraft = useCallback((updater: (snapshot: ConsoleSettingsSnapshot) => void) => {
    setDraft((prev: ConsoleSettingsSnapshot | null) => {
      if (!prev) return prev;
      const next = cloneConsoleSettingsSnapshot(prev);
      updater(next);
      return next;
    });
    setPendingLeaveConfirm(false);
  }, []);

  const reloadSnapshot = useCallback(async () => {
    setLoading(true);
    setEditor(null);
    try {
      const snapshot = await onLoad();
      setDraft(cloneConsoleSettingsSnapshot(snapshot));
      setBaseline(cloneConsoleSettingsSnapshot(snapshot));
      setStatus('已从磁盘重新加载配置', 'success');
      setPendingLeaveConfirm(false);
    } catch (err: unknown) {
      setStatus(`重新加载失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [onLoad, setStatus]);

  const handleAddMcpServer = useCallback(() => {
    let nextIndex = 0;
    updateDraft((snapshot: ConsoleSettingsSnapshot) => {
      nextIndex = snapshot.mcpServers.length;
      snapshot.mcpServers.push(createDefaultMCPServerEntry());
    });
    setSelectedRowId(`mcp.${nextIndex}.name`);
    setStatus('已新增 MCP 服务器草稿，请先填写名称后保存', 'info');
  }, [setStatus, updateDraft]);

  const startEdit = useCallback((target: Extract<RowTarget, { kind: 'tierField' | 'systemField' | 'mcpField' }>) => {
    if (!draft) return;

    if (target.kind === 'tierField') {
      const value = draft.tiers[target.tier][target.field];
      setEditor({
        target,
        label: `${target.tier}.${target.field}`,
        value,
      });
      setEditorValue(String(value ?? ''));
      return;
    }

    if (target.kind === 'systemField') {
      const rawValue = target.field === 'maxToolRounds'
        ? String(draft.system.maxToolRounds)
        : target.field === 'stream'
          ? String(draft.system.stream)
          : draft.system.systemPrompt;
      const value = target.field === 'systemPrompt'
        ? escapeMultilineForInput(rawValue)
        : rawValue;
      setEditor({
        target,
        label: `system.${target.field}`,
        value,
        hint: target.field === 'systemPrompt' ? '使用 \\n 表示换行，Enter 保存，Esc 取消。' : undefined,
      });
      setEditorValue(value);
      return;
    }

    const server = draft.mcpServers[target.serverIndex];
    if (!server) return;

    const rawValue = String(server[target.field] ?? '');
    const value = target.field === 'args'
      ? escapeMultilineForInput(rawValue)
      : rawValue;

    setEditor({
      target,
      label: `mcp.${server.name || `server_${target.serverIndex + 1}`}.${target.field}`,
      value,
      hint: target.field === 'args' ? '使用 \\n 表示多行参数，Enter 保存，Esc 取消。' : undefined,
    });
    setEditorValue(value);
  }, [draft]);

  const applyCycle = useCallback((target: RowTarget, direction: 1 | -1) => {
    updateDraft((snapshot: ConsoleSettingsSnapshot) => {
      if (target.kind === 'tierProvider') {
        const current = snapshot.tiers[target.tier].provider;
        const next = cycleValue(CONSOLE_LLM_PROVIDER_OPTIONS, current, direction);
        snapshot.tiers[target.tier] = applyTierProviderChange(snapshot.tiers[target.tier], next as ConsoleLLMProvider);
        return;
      }

      if (target.kind === 'mcpField' && target.field === 'transport') {
        const current = snapshot.mcpServers[target.serverIndex]?.transport;
        if (!current) return;
        snapshot.mcpServers[target.serverIndex].transport = cycleValue(CONSOLE_MCP_TRANSPORT_OPTIONS, current, direction) as ConsoleMCPTransport;
      }
    });
  }, [updateDraft]);

  const applyToggle = useCallback((target: RowTarget) => {
    updateDraft((snapshot: ConsoleSettingsSnapshot) => {
      if (target.kind === 'tierEnabled') {
        snapshot.tierEnabled[target.tier] = !snapshot.tierEnabled[target.tier];
        return;
      }

      if (target.kind === 'systemField' && target.field === 'stream') {
        snapshot.system.stream = !snapshot.system.stream;
        return;
      }

      if (target.kind === 'mcpField' && target.field === 'enabled') {
        const server = snapshot.mcpServers[target.serverIndex];
        if (server) {
          server.enabled = !server.enabled;
        }
      }
    });
  }, [updateDraft]);

  const submitEditor = useCallback(() => {
    if (!editor) return;

    const value = editor.target.kind === 'systemField' && editor.target.field === 'systemPrompt'
      ? restoreMultilineFromInput(editorValue)
      : editor.target.kind === 'mcpField' && editor.target.field === 'args'
        ? restoreMultilineFromInput(editorValue)
        : editorValue;

    if (editor.target.kind === 'systemField' && editor.target.field === 'maxToolRounds') {
      const parsed = Number(value.trim());
      if (!Number.isFinite(parsed) || parsed < 1) {
        setStatus('请输入大于等于 1 的有效数字', 'error');
        return;
      }
    }

    if (editor.target.kind === 'mcpField' && editor.target.field === 'timeout') {
      const parsed = Number(value.trim());
      if (!Number.isFinite(parsed) || parsed < 1000) {
        setStatus('MCP 超时必须是大于等于 1000 的数字', 'error');
        return;
      }
    }

    updateDraft((snapshot: ConsoleSettingsSnapshot) => {
      if (editor.target.kind === 'tierField') {
        const tier = snapshot.tiers[editor.target.tier as ConsoleTierName];
        if (editor.target.field === 'model') {
          tier.model = value;
        } else if (editor.target.field === 'apiKey') {
          tier.apiKey = value;
        } else {
          tier.baseUrl = value;
        }
        return;
      }

      if (editor.target.kind === 'systemField') {
        if (editor.target.field === 'systemPrompt') {
          snapshot.system.systemPrompt = value;
        } else if (editor.target.field === 'maxToolRounds') {
          snapshot.system.maxToolRounds = Number(value.trim());
        }
        return;
      }

      const server = snapshot.mcpServers[editor.target.serverIndex];
      if (!server) return;

      if (editor.target.field === 'name') {
        server.name = value.replace(/[^a-zA-Z0-9_]/g, '_');
      } else if (editor.target.field === 'timeout') {
        server.timeout = Number(value.trim());
      } else if (editor.target.field === 'command') {
        server.command = value;
      } else if (editor.target.field === 'args') {
        server.args = value;
      } else if (editor.target.field === 'cwd') {
        server.cwd = value;
      } else if (editor.target.field === 'url') {
        server.url = value;
      } else if (editor.target.field === 'authHeader') {
        server.authHeader = value;
      } else {
        server.transport = value as ConsoleMCPTransport;
      }
    });

    setStatus('字段已更新，按 S 保存并热重载', 'success');
    setEditor(null);
    setEditorValue('');
  }, [editor, editorValue, setStatus, updateDraft]);

  const handleSave = useCallback(async () => {
    if (!draft || saving) return;

    setSaving(true);
    setStatus('正在保存并尝试热重载...', 'info');

    try {
      const result = await onSave(draft);
      if (!result.ok) {
        setStatus(`保存失败：${result.message}`, 'error');
        return;
      }

      if (result.snapshot) {
        setDraft(cloneConsoleSettingsSnapshot(result.snapshot));
        setBaseline(cloneConsoleSettingsSnapshot(result.snapshot));
      } else {
        setBaseline(cloneConsoleSettingsSnapshot(draft));
      }
      setPendingLeaveConfirm(false);
      setStatus(result.message, result.restartRequired ? 'warning' : 'success');
    } catch (err: unknown) {
      setStatus(`保存失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [draft, onSave, saving, setStatus]);

  const handleDeleteCurrentServer = useCallback(() => {
    if (!selectedRow?.target || selectedRow.target.kind !== 'mcpField' || !draft) {
      setStatus('请先选中某个 MCP 服务器字段后再删除', 'warning');
      return;
    }

    const index = selectedRow.target.serverIndex;
    const server = draft.mcpServers[index];
    if (!server) return;

    updateDraft((snapshot: ConsoleSettingsSnapshot) => {
      snapshot.mcpServers.splice(index, 1);
    });
    setStatus(`已删除 MCP 草稿：${server.name || `server_${index + 1}`}（未保存）`, 'warning');
  }, [draft, selectedRow, setStatus, updateDraft]);

  useInput((input: string, key: any) => {
    if (editor) {
      if (key.escape) {
        setEditor(null);
        setEditorValue('');
        setStatus('已取消编辑', 'warning');
      }
      return;
    }

    if (loading || saving) {
      if (key.escape) {
        onBack();
      }
      return;
    }

    const currentIndex = selectedSelectableIndex >= 0 ? selectedSelectableIndex : 0;

    if (key.upArrow) {
      const prev = selectableRows[Math.max(0, currentIndex - 1)];
      if (prev) setSelectedRowId(prev.id);
      setPendingLeaveConfirm(false);
      return;
    }

    if (key.downArrow) {
      const next = selectableRows[Math.min(selectableRows.length - 1, currentIndex + 1)];
      if (next) setSelectedRowId(next.id);
      setPendingLeaveConfirm(false);
      return;
    }

    if (selectedRow?.target && key.leftArrow) {
      if (selectedRow.target.kind === 'tierProvider' || (selectedRow.target.kind === 'mcpField' && selectedRow.target.field === 'transport')) {
        applyCycle(selectedRow.target, -1);
      }
      setPendingLeaveConfirm(false);
      return;
    }

    if (selectedRow?.target && key.rightArrow) {
      if (selectedRow.target.kind === 'tierProvider' || (selectedRow.target.kind === 'mcpField' && selectedRow.target.field === 'transport')) {
        applyCycle(selectedRow.target, 1);
      }
      setPendingLeaveConfirm(false);
      return;
    }

    if (key.escape) {
      if (isDirty && !pendingLeaveConfirm) {
        setPendingLeaveConfirm(true);
        setStatus('当前有未保存修改，再按一次 Esc 将直接返回对话并丢弃本地草稿', 'warning');
        return;
      }
      onBack();
      return;
    }

    if (input.toLowerCase() === 's') {
      void handleSave();
      return;
    }

    if (input.toLowerCase() === 'r') {
      void reloadSnapshot();
      return;
    }

    if (input.toLowerCase() === 'a') {
      handleAddMcpServer();
      return;
    }

    if (input.toLowerCase() === 'd') {
      handleDeleteCurrentServer();
      return;
    }

    if (input === ' ' && selectedRow?.target) {
      if (
        selectedRow.target.kind === 'tierEnabled'
        || (selectedRow.target.kind === 'systemField' && selectedRow.target.field === 'stream')
        || (selectedRow.target.kind === 'mcpField' && selectedRow.target.field === 'enabled')
      ) {
        applyToggle(selectedRow.target);
      }
      return;
    }

    if (key.return && selectedRow?.target) {
      if (selectedRow.target.kind === 'action' && selectedRow.target.action === 'addMcp') {
        handleAddMcpServer();
        return;
      }

      if (
        selectedRow.target.kind === 'tierEnabled'
        || (selectedRow.target.kind === 'systemField' && selectedRow.target.field === 'stream')
        || (selectedRow.target.kind === 'mcpField' && selectedRow.target.field === 'enabled')
      ) {
        applyToggle(selectedRow.target);
        return;
      }

      if (selectedRow.target.kind === 'tierProvider' || (selectedRow.target.kind === 'mcpField' && selectedRow.target.field === 'transport')) {
        applyCycle(selectedRow.target, 1);
        return;
      }

      if (
        selectedRow.target.kind === 'tierField'
        || (selectedRow.target.kind === 'systemField' && selectedRow.target.field !== 'stream')
        || (selectedRow.target.kind === 'mcpField' && selectedRow.target.field !== 'enabled' && selectedRow.target.field !== 'transport')
      ) {
        startEdit(selectedRow.target as Extract<RowTarget, { kind: 'tierField' | 'systemField' | 'mcpField' }>);
      }
    }
  }, { isActive: true });

  const listHeight = Math.max(10, termHeight - (editor ? 13 : 10));
  const selectedRowAbsoluteIndex = Math.max(0, rows.findIndex((row: SettingsRow) => row.id === selectedRowId));
  let windowStart = Math.max(0, selectedRowAbsoluteIndex - Math.floor(listHeight / 2));
  let windowEnd = Math.min(rows.length, windowStart + listHeight);
  if (windowEnd - windowStart < listHeight) {
    windowStart = Math.max(0, windowEnd - listHeight);
  }
  const visibleRows = rows.slice(windowStart, windowEnd);

  if (loading && !draft) {
    return (
      <Box flexDirection="column" width="100%">
        <Box marginBottom={1}>
          <Gradient name="atlas">
            <Text bold italic>IRIS</Text>
          </Gradient>
        </Box>
        <Text bold>设置中心</Text>
        <Text dimColor>正在加载配置...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      <Box marginBottom={1}>
        <Gradient name="atlas">
          <Text bold italic>IRIS</Text>
        </Gradient>
      </Box>

      <Text bold>设置中心</Text>
      <Text dimColor>在终端内管理模型配置、系统参数与 MCP 服务器；保存后会尝试热重载。</Text>
      <Text color={isDirty ? 'yellow' : 'green'}>
        {isDirty ? '● 有未保存修改' : '✓ 当前草稿已同步'}
        {saving ? '  ·  保存中...' : ''}
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {windowStart > 0 && <Text dimColor>…</Text>}
        {visibleRows.map((row: SettingsRow) => {
          const isSelected = row.id === selectedRowId && !!row.target;
          const prefix = row.kind === 'section'
            ? '■'
            : row.kind === 'action'
              ? (isSelected ? '❯' : '•')
              : row.kind === 'field'
                ? (isSelected ? '❯' : ' ')
                : ' ';

          if (row.kind === 'section') {
            return (
              <Box key={row.id} marginTop={1}>
                <Text bold color="magenta">{prefix} {row.label}</Text>
              </Box>
            );
          }

          return (
            <Box key={row.id} paddingLeft={row.indent ?? 0}>
              <Text color={isSelected ? 'cyan' : 'gray'}>{prefix}</Text>
              <Text> </Text>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected && row.kind !== 'info'}>{row.label}</Text>
              {row.value != null && (
                <Text color={isSelected ? 'cyan' : 'gray'}>{`  ${row.value}`}</Text>
              )}
            </Box>
          );
        })}
        {windowEnd < rows.length && <Text dimColor>…</Text>}
      </Box>

      <Box marginTop={1}>
        <Text wrap="truncate-end">
          <Text dimColor>{'─'.repeat(Math.max(3, termWidth - 6))}</Text>
        </Text>
      </Box>

      {selectedRow?.description && !editor && (
        <Text dimColor>{selectedRow.description}</Text>
      )}

      {statusText && (
        <Text color={getStatusColor(statusKind)}>{statusText}</Text>
      )}

      {editor ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="cyan">编辑：{editor.label}</Text>
          {editor.hint && <Text dimColor>{editor.hint}</Text>}
          <Box>
            <Text color="cyan">❯ </Text>
            <TextInput
              value={editorValue}
              onChange={setEditorValue}
              onSubmit={submitEditor}
              placeholder=""
            />
          </Box>
          <Text dimColor>Enter 保存 · Esc 取消</Text>
        </Box>
      ) : (
        <Text dimColor>
          ↑↓ 选择  ←→ 切换枚举  Space 切换布尔  Enter 编辑  A 新增 MCP  D 删除当前 MCP  S 保存  R 重载  Esc 返回
        </Text>
      )}
    </Box>
  );
}
