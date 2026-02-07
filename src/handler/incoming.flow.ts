import type { FilePartInput, OpencodeClient, TextPartInput } from '@opencode-ai/sdk';
import type { BridgeAdapter } from '../types';
import { LOADING_EMOJI } from '../constants';
import { drainPendingFileParts, saveFilePartToLocal } from '../bridge/file.store';
import { ERROR_HEADER, parseSlashCommand, globalState } from '../utils';
import { handleSlashCommand } from './command';
import type { AdapterMux } from './mux';

type SessionContext = { chatId: string; senderId: string };
type NamedRecord = { id?: string; name?: string; title?: string; description?: string };
type DataEnvelope = { data?: unknown };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function extractData(value: unknown): unknown {
  if (isRecord(value) && 'data' in value) return (value as DataEnvelope).data;
  return value;
}

function asArray<T>(value: unknown, map: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(map).filter((v): v is T => v !== null);
}

function toNamedRecord(item: unknown): NamedRecord | null {
  if (!isRecord(item)) return null;
  return {
    id: typeof item.id === 'string' ? item.id : undefined,
    name: typeof item.name === 'string' ? item.name : undefined,
    title: typeof item.title === 'string' ? item.title : undefined,
    description: typeof item.description === 'string' ? item.description : undefined,
  };
}

function isFilePartInput(part: TextPartInput | FilePartInput): part is FilePartInput {
  return part.type === 'file';
}

export type IncomingFlowDeps = {
  sessionCache: Map<string, string>;
  sessionToAdapterKey: Map<string, string>;
  sessionToCtx: Map<string, SessionContext>;
  chatAgent: Map<string, string>;
  chatSessionList: Map<string, Array<{ id: string; title: string }>>;
  chatAgentList: Map<string, Array<{ id: string; name: string }>>;
  chatMaxFileSizeMb: Map<string, number>;
  chatMaxFileRetry: Map<string, number>;
  formatUserError: (err: unknown) => string;
};

export const createIncomingHandlerWithDeps = (
  api: OpencodeClient,
  mux: AdapterMux,
  adapterKey: string,
  deps: IncomingFlowDeps,
) => {
  const adapter = mux.get(adapterKey);
  if (!adapter) throw new Error(`[Handler] Adapter not found: ${adapterKey}`);

  return async (
    chatId: string,
    text: string,
    messageId: string,
    senderId: string,
    parts?: Array<TextPartInput | FilePartInput>,
  ) => {
    console.log(
      `[Bridge] 📥 [${adapterKey}] Incoming chat=${chatId} sender=${senderId} msg=${messageId} text="${text || ''}" parts=${parts?.length || 0}`,
    );

    const slash = parseSlashCommand(text);
    const cacheKey = `${adapterKey}:${chatId}`;
    const rawCommand = slash?.command?.toLowerCase();
    const normalizedCommand =
      rawCommand === 'resume' || rawCommand === 'continue'
        ? 'sessions'
        : rawCommand === 'summarize'
          ? 'compact'
          : rawCommand === 'clear'
            ? 'new'
            : rawCommand;
    const targetSessionId =
      normalizedCommand === 'sessions' && slash?.arguments
        ? slash.arguments.trim().split(/\s+/)[0]
        : null;
    const targetAgentArg = slash?.arguments ? slash.arguments.trim() : '';
    const targetAgent = normalizedCommand === 'agent' && targetAgentArg ? targetAgentArg : null;
    const shouldCreateNew = normalizedCommand === 'new';

    if (!slash && text.trim().toLowerCase() === 'ping') {
      await adapter.sendMessage(chatId, 'Pong! ⚡️');
      return;
    }

    let reactionId: string | null = null;

    try {
      if (messageId && adapter.addReaction) {
        reactionId = await adapter.addReaction(messageId, LOADING_EMOJI);
      }

      const createNewSession = async () => {
        const uniqueTitle = `[${adapterKey}] Chat ${chatId.slice(
          -4,
        )} [${new Date().toLocaleTimeString()}]`;
        const res = await api.session.create({ body: { title: uniqueTitle } });
        const data = extractData(res);
        const sessionId = isRecord(data) && typeof data.id === 'string' ? data.id : undefined;
        if (sessionId) {
          deps.sessionCache.set(cacheKey, sessionId);
          deps.sessionToAdapterKey.set(sessionId, adapterKey);
          deps.sessionToCtx.set(sessionId, { chatId, senderId });
          deps.chatAgent.delete(cacheKey);
        }
        return sessionId;
      };

      const ensureSession = async () => {
        let sessionId = deps.sessionCache.get(cacheKey);
        if (!sessionId) {
          sessionId = await createNewSession();
        }
        if (!sessionId) throw new Error('Failed to init Session');
        return sessionId;
      };

      const sendCommandMessage = async (content: string) => {
        await adapter.sendMessage(chatId, `## Command\n${content}`);
      };

      const sendErrorMessage = async (content: string) => {
        await adapter.sendMessage(chatId, `${ERROR_HEADER}\n${content}`);
      };

      globalState.__bridge_send_error_message = async (cId: string, content: string) => {
        await adapter.sendMessage(cId, `${ERROR_HEADER}\n${content}`);
      };

      const sendUnsupported = async () => {
        await sendCommandMessage(`❌ 命令 /${slash?.command} 暂不支持在聊天中使用。`);
      };

      const isKnownCustomCommand = async (name: string): Promise<boolean | null> => {
        try {
          const res = await api.command.list();
          const list = asArray(extractData(res), toNamedRecord);
          return list.some(cmd => cmd.name === name);
        } catch {
          return null;
        }
      };

      if (slash) {
        const handled = await handleSlashCommand({
          api,
          adapterKey,
          chatId,
          senderId,
          cacheKey,
          slash,
          normalizedCommand: normalizedCommand || '',
          targetSessionId,
          targetAgent,
          shouldCreateNew,
          sessionCache: deps.sessionCache,
          sessionToAdapterKey: deps.sessionToAdapterKey,
          sessionToCtx: deps.sessionToCtx,
          chatAgent: deps.chatAgent,
          chatSessionList: deps.chatSessionList,
          chatAgentList: deps.chatAgentList,
          chatMaxFileSizeMb: deps.chatMaxFileSizeMb,
          chatMaxFileRetry: deps.chatMaxFileRetry,
          ensureSession,
          createNewSession,
          sendCommandMessage,
          sendErrorMessage,
          sendUnsupported,
          isKnownCustomCommand,
        });
        if (handled) return;
      }

      const fileParts = (parts || []).filter(isFilePartInput);
      const hasText = Boolean(text && text.trim());

      if (fileParts.length > 0) {
        console.log(
          `[Bridge] 📎 [${adapterKey}] file parts detail count=${fileParts.length} chat=${chatId}`,
        );
        fileParts.forEach((p, idx) => {
          console.log(
            `[Bridge] 📎 [${adapterKey}] file[${idx}] name=${p.filename || ''} mime=${p.mime || ''} url=${(p.url || '').slice(0, 64)}${(p.url || '').length > 64 ? '...' : ''}`,
          );
        });

        const saved: string[] = [];
        const duplicated: string[] = [];
        let failed = 0;

        console.log(
          `[Bridge] 📁 [${adapterKey}] received ${fileParts.length} file(s) chat=${chatId}`,
        );

        for (const p of fileParts) {
          const res = await saveFilePartToLocal(cacheKey, p);
          if (res.ok && res.record) {
            if (res.duplicated) duplicated.push(res.record.path);
            else saved.push(res.record.path);
          } else {
            failed++;
          }
        }

        if (!hasText) {
          console.log(
            `[Bridge] 📁 [${adapterKey}] file-only message chat=${chatId} saved=${saved.length} duplicated=${duplicated.length} failed=${failed}`,
          );
          const lines: string[] = [];
          if (saved.length > 0 && failed === 0 && duplicated.length === 0) {
            lines.push(
              `## Status\n✅ 图片/文件保存成功：\n${saved
                .map(p => `- ${p}`)
                .join('\n')}\n⏳ 等候指令。`,
            );
          } else if (saved.length === 0 && duplicated.length === 0) {
            lines.push('## Status\n❌ 文件上传失败，请重试。');
          } else {
            lines.push('## Status');
            if (saved.length > 0) {
              lines.push(`✅ 已保存：\n${saved.map(p => `- ${p}`).join('\n')}`);
            }
            if (duplicated.length > 0) {
              lines.push(`🟡 已存在，未重复入队：\n${duplicated.map(p => `- ${p}`).join('\n')}`);
            }
            if (failed > 0) lines.push('❌ 部分文件上传失败，请重试。');
          }

          const content = lines.join('\n');
          const progressMap: Map<string, string> | undefined =
            globalState.__bridge_progress_msg_ids;
          const progressKey = messageId;
          const progressMsgId = progressMap?.get(progressKey);
          if (progressMsgId && adapter.editMessage) {
            const ok = await adapter.editMessage(chatId, progressMsgId, content);
            if (ok) {
              progressMap?.delete(progressKey);
              return;
            }
          }

          await adapter.sendMessage(chatId, content);
          return;
        }
      }

      const sessionId = await ensureSession();
      deps.sessionToAdapterKey.set(sessionId, adapterKey);
      deps.sessionToCtx.set(sessionId, { chatId, senderId });

      const agent = deps.chatAgent.get(cacheKey);
      const partList: Array<TextPartInput | FilePartInput> = [];
      if (text && text.trim()) {
        partList.push({ type: 'text', text });
      }
      const pendingFiles = await drainPendingFileParts(cacheKey);
      if (pendingFiles.length > 0) {
        console.log(
          `[Bridge] 📤 [${adapterKey}] attach pending files count=${pendingFiles.length} chat=${chatId}`,
        );
        partList.push(...pendingFiles);
      }
      if (partList.length === 0) return;

      console.log(
        `[Bridge] 🚀 [${adapterKey}] prompt parts=${partList.length} text=${hasText} files=${pendingFiles.length} chat=${chatId}`,
      );
      await api.session.prompt({
        path: { id: sessionId },
        body: { parts: partList, ...(agent ? { agent } : {}) },
      });

      console.log(`[Bridge] [${adapterKey}] [Session: ${sessionId}] 🚀 Prompt Sent.`);
    } catch (err: unknown) {
      console.error(`[Bridge] ❌ [${adapterKey}] Error:`, err);
      await adapter.sendMessage(chatId, `${ERROR_HEADER}\n${deps.formatUserError(err)}`);
    } finally {
      if (messageId && reactionId && adapter.removeReaction) {
        await adapter.removeReaction(messageId, reactionId).catch(() => {});
      }
    }
  };
};
