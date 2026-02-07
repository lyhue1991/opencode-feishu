// src/handler/command.ts
import type { FilePartInput, OpencodeClient, TextPartInput } from '@opencode-ai/sdk';
import { DEFAULT_MAX_FILE_MB, DEFAULT_MAX_FILE_RETRY } from '../utils';

type SessionListItem = { id: string; title: string };
type AgentListItem = { id: string; name: string };
type NamedRecord = { id?: string; name?: string; title?: string; description?: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function extractData(value: unknown): unknown {
  if (isRecord(value) && 'data' in value) return value.data;
  return value;
}

function asNamedRecords(value: unknown): NamedRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!isRecord(item)) return null;
      return {
        id: typeof item.id === 'string' ? item.id : undefined,
        name: typeof item.name === 'string' ? item.name : undefined,
        title: typeof item.title === 'string' ? item.title : undefined,
        description: typeof item.description === 'string' ? item.description : undefined,
      } as NamedRecord;
    })
    .filter((v): v is NamedRecord => v !== null);
}
export type CommandContext = {
  api: OpencodeClient;
  adapterKey: string;
  chatId: string;
  senderId: string;
  cacheKey: string;
  slash: { command: string; arguments: string };
  normalizedCommand: string;
  targetSessionId: string | null;
  targetAgent: string | null;
  shouldCreateNew: boolean;
  sessionCache: Map<string, string>;
  sessionToAdapterKey: Map<string, string>;
  sessionToCtx: Map<string, { chatId: string; senderId: string }>;
  chatAgent: Map<string, string>;
  chatSessionList: Map<string, Array<SessionListItem>>;
  chatAgentList: Map<string, Array<AgentListItem>>;
  chatMaxFileSizeMb: Map<string, number>;
  chatMaxFileRetry: Map<string, number>;
  ensureSession: () => Promise<string>;
  createNewSession: () => Promise<string | undefined>;
  sendCommandMessage: (content: string) => Promise<void>;
  sendErrorMessage: (content: string) => Promise<void>;
  sendUnsupported: () => Promise<void>;
  isKnownCustomCommand: (name: string) => Promise<boolean | null>;
};

export async function handleSlashCommand(ctx: CommandContext): Promise<boolean> {
  const {
    api,
    chatId,
    cacheKey,
    slash,
    normalizedCommand,
    targetSessionId,
    targetAgent,
    shouldCreateNew,
    sessionCache,
    sessionToAdapterKey,
    sessionToCtx,
    chatAgent,
    chatSessionList,
    chatAgentList,
    chatMaxFileSizeMb,
    chatMaxFileRetry,
    ensureSession,
    createNewSession,
    sendCommandMessage,
    sendUnsupported,
    isKnownCustomCommand,
  } = ctx;

  if (normalizedCommand === 'help') {
    const res = await api.command.list();
    const list = asNamedRecords(extractData(res));

    const lines: string[] = [];
    lines.push('## Command');
    lines.push('### Help');
    lines.push('/help - 查看命令与用法');
    lines.push('/models - 查看可用模型（/models <序号> 切换）');
    lines.push('/new - 新建会话并切换');
    lines.push('/sessions - 列出会话（用 /sessions <id> 或 /sessions <序号> 切换）');
    lines.push('/maxFileSize <xmb> - 设置上传文件大小限制（默认10MB）');
    lines.push('/maxFileRetry <n> - 设置资源下载重试次数（默认3）');
    lines.push('/share - 分享当前会话');
    lines.push('/unshare - 取消分享');
    lines.push('/compact - 压缩/总结当前会话');
    lines.push('/init - 初始化项目（生成 AGENTS.md）');
    lines.push('/agent - 列出 Agents');
    lines.push('/agent <序号|name> - 切换 Agent（序号或精确名称）');

    if (list.length > 0) {
      lines.push('### Custom Commands');
      list.forEach(cmd => {
        if (!cmd.name) return;
        const desc = cmd.description ? `- ${cmd.description}` : '';
        lines.push(`/${cmd.name} ${desc}`);
      });
    }
    await sendCommandMessage(lines.join('\n'));
    return true;
  }

  if (normalizedCommand === 'models') {
    const res = await api.config.providers();
    const data = res?.data;
    const providers = data?.providers ?? [];
    const defaults = data?.default ?? {};

    if (!Array.isArray(providers) || providers.length === 0) {
      await sendCommandMessage('暂无可用模型信息。');
      return true;
    }

    if (slash.arguments) {
      const arg = slash.arguments.trim();
      const m = arg.match(/^(\d+)\.(\d+)$/);
      if (!m) {
        await sendCommandMessage('❌ 无效序号，请使用 /models 1.2');
        return true;
      }
      const pIdx = Number(m[1]) - 1;
      const mIdx = Number(m[2]) - 1;
      if (pIdx < 0 || mIdx < 0 || pIdx >= providers.length) {
        await sendCommandMessage(`❌ 无效序号: ${arg}`);
        return true;
      }
      const p = providers[pIdx];
      const modelKeys = Object.keys(p?.models || {});
      if (mIdx >= modelKeys.length) {
        await sendCommandMessage(`❌ 无效序号: ${arg}`);
        return true;
      }
      const key = modelKeys[mIdx];
      const model = p.models?.[key];
      const modelId = model?.id;
      if (!modelId) {
        await sendCommandMessage(`❌ 模型ID缺失: ${arg}`);
        return true;
      }

      const sessionId = await ensureSession();
      await api.session.command({
        path: { id: sessionId },
        body: { command: 'model', arguments: modelId },
      });
      await sendCommandMessage(`✅ 已切换模型: ${model?.name || modelId}`);
      return true;
    }

    const lines: string[] = [];
    lines.push('## Command');
    lines.push('### Models');

    const defaultLines: string[] = [];
    Object.keys(defaults || {}).forEach(key => {
      defaultLines.push(`${key} -> ${defaults[key]}`);
    });

    if (defaultLines.length > 0) {
      lines.push('Default:');
      defaultLines.forEach(l => lines.push(l));
    }

    providers.forEach((p, index) => {
      Object.keys(p.models).forEach((key, idx) => {
        lines.push(`${index + 1}.${idx + 1}. ${p.models[key].name} (${p.models[key].id})`);
      });
    });

    await sendCommandMessage(lines.join('\n'));
    return true;
  }

  if (normalizedCommand === 'maxfilesize') {
    const current = chatMaxFileSizeMb.get(chatId) ?? DEFAULT_MAX_FILE_MB;
    if (!slash.arguments) {
      await sendCommandMessage(`当前文件大小限制：${current}MB`);
      return true;
    }
    const m = slash.arguments.trim().match(/(\d+(?:\.\d+)?)/);
    const value = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(value) || value <= 0) {
      await sendCommandMessage('❌ 请输入有效数值，例如 /maxFileSize 10');
      return true;
    }
    chatMaxFileSizeMb.set(chatId, value);
    await sendCommandMessage(`✅ 已设置文件大小限制：${value}MB`);
    return true;
  }

  if (normalizedCommand === 'maxfileretry') {
    const current = chatMaxFileRetry.get(chatId) ?? DEFAULT_MAX_FILE_RETRY;
    if (!slash.arguments) {
      await sendCommandMessage(`当前重试次数：${current}`);
      return true;
    }
    const m = slash.arguments.trim().match(/(\d+)/);
    const value = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(value) || value < 0) {
      await sendCommandMessage('❌ 请输入有效整数，例如 /maxFileRetry 3');
      return true;
    }
    chatMaxFileRetry.set(chatId, value);
    await sendCommandMessage(`✅ 已设置重试次数：${value}`);
    return true;
  }

  if (normalizedCommand === 'agent' && targetAgent) {
    if (/^\d+$/.test(targetAgent)) {
      const list = chatAgentList.get(cacheKey) || [];
      const idx = Number(targetAgent) - 1;
      if (idx < 0 || idx >= list.length) {
        await sendCommandMessage(`❌ 无效序号: ${targetAgent}`);
        return true;
      }
      const agent = list[idx];
      chatAgent.set(cacheKey, agent.name || agent.id);
      await sendCommandMessage(`✅ 已切换 Agent: ${agent.name || agent.id}`);
      return true;
    }

    const res = await api.app.agents();
    const list = asNamedRecords(extractData(res));
    const exact = list.find(a => a.name === targetAgent || a.id === targetAgent);
    if (!exact) {
      await sendCommandMessage(`❌ 未找到 Agent: ${targetAgent}`);
      return true;
    }
    const picked = exact.name || exact.id;
    if (!picked) {
      await sendCommandMessage(`❌ 未找到 Agent: ${targetAgent}`);
      return true;
    }
    chatAgent.set(cacheKey, picked);
    await sendCommandMessage(`✅ 已切换 Agent: ${picked}`);
    return true;
  }

  if (normalizedCommand === 'agent' && !targetAgent) {
    const res = await api.app.agents();
    const list = asNamedRecords(extractData(res));
    if (list.length === 0) {
      await sendCommandMessage('暂无可用 Agent。');
      return true;
    }
    const agents = list
      .slice(0, 20)
      .map(a => ({ id: a.id, name: a.name || a.id }))
      .filter((a): a is { id: string; name: string } => Boolean(a.id && a.name));
    chatAgentList.set(cacheKey, agents);
    const lines = ['## Command', '### Agents', '请输入 /agent <序号> 或 <name> 切换：'];
    agents.forEach((a, idx) => {
      lines.push(`${idx + 1}. ${a.name} (${a.id})`);
    });
    await sendCommandMessage(lines.join('\n'));
    return true;
  }

  if (normalizedCommand === 'sessions' && !targetSessionId) {
    const res = await api.session.list({});
    const sessions = asNamedRecords(extractData(res));
    if (sessions.length === 0) {
      await sendCommandMessage('暂无会话，请使用 /new 创建。');
      return true;
    }
    const list = sessions
      .slice(0, 20)
      .map(s => ({ id: s.id, title: s.title || 'Untitled' }))
      .filter((s): s is { id: string; title: string } => Boolean(s.id));
    chatSessionList.set(cacheKey, list);
    const lines = ['## Command', '### Sessions', '请输入 /sessions <序号> 切换：'];
    list.forEach((s, idx) => {
      lines.push(`${idx + 1}. ${s.title}`);
    });
    await sendCommandMessage(lines.join('\n'));
    return true;
  }

  if (normalizedCommand === 'sessions' && targetSessionId) {
    let targetId = targetSessionId;
    if (/^\d+$/.test(targetSessionId)) {
      const list = chatSessionList.get(cacheKey) || [];
      const idx = Number(targetSessionId) - 1;
      if (idx >= 0 && idx < list.length) {
        targetId = list[idx].id;
      } else {
        await sendCommandMessage(`❌ 无效序号: ${targetSessionId}`);
        return true;
      }
    }
    sessionCache.set(cacheKey, targetId);
    sessionToAdapterKey.set(targetId, ctx.adapterKey);
    sessionToCtx.set(targetId, { chatId: ctx.chatId, senderId: ctx.senderId });
    chatAgent.delete(cacheKey);
    await sendCommandMessage(`✅ 已切换到会话: ${targetId}`);
    return true;
  }

  if (normalizedCommand === 'share') {
    const sessionId = await ensureSession();
    const res = await api.session.share({ path: { id: sessionId } });
    const data = extractData(res);
    const url =
      isRecord(data) &&
      isRecord(data.share) &&
      typeof data.share.url === 'string'
        ? data.share.url
        : undefined;
    await sendCommandMessage(url ? `✅ 分享链接: ${url}` : '✅ 已分享会话。');
    return true;
  }

  if (normalizedCommand === 'unshare') {
    const sessionId = await ensureSession();
    await api.session.unshare({ path: { id: sessionId } });
    await sendCommandMessage('✅ 已取消分享。');
    return true;
  }

  if (normalizedCommand === 'compact') {
    const sessionId = await ensureSession();
    await api.session.summarize({ path: { id: sessionId } });
    await sendCommandMessage('✅ 已触发会话压缩。');
    return true;
  }

  if (normalizedCommand === 'init') {
    const sessionId = await ensureSession();
    await api.session.init({ path: { id: sessionId } });
    await sendCommandMessage('✅ 已触发初始化（AGENTS.md）。');
    return true;
  }

  if (normalizedCommand === 'new') {
    const sessionId = await createNewSession();
    if (sessionId) {
      await sendCommandMessage(`✅ 已切换到新会话: ${sessionId}`);
    } else {
      await sendCommandMessage('❌ 新会话创建失败，请稍后重试。');
    }
    return true;
  }

  const unsupportedCommands = new Set([
    'connect',
    'details',
    'editor',
    'export',
    'exit',
    'quit',
    'q',
    'theme',
    'themes',
    'thinking',
  ]);
  if (unsupportedCommands.has(normalizedCommand || '')) {
    await sendUnsupported();
    return true;
  }

  const sessionId = await ensureSession();
  const isCustom = await isKnownCustomCommand(slash.command);
  if (isCustom === false) {
    await sendCommandMessage(`❌ 无效指令: /${slash.command}`);
    return true;
  }
  await api.session.command({
    path: { id: sessionId },
    body: { command: slash.command, arguments: slash.arguments },
  });
  console.log(
    `[Bridge] [${ctx.adapterKey}] [Session: ${sessionId}] 🚀 Command /${slash.command} Sent.`
  );
  return true;
}
