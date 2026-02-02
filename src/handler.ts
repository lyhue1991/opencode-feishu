import type { OpenCodeApi } from './opencode';
import type { FeishuClient } from './feishu';
import { LOADING_EMOJI } from './constants';
import { Part, Event } from '@opencode-ai/sdk';

interface SessionContext {
  chatId: string;
  senderId: string;
}

interface MessageBuffer {
  feishuMsgId: string | null;
  fullContent: string;
  type: Part['type'];
  lastUpdateTime: number;
  isFinished: boolean;
}

const sessionToFeishuMap = new Map<string, SessionContext>();

const messageBuffers = new Map<string, MessageBuffer>();

const UPDATE_INTERVAL = 800;

export async function startGlobalEventListener(api: OpenCodeApi, feishu: FeishuClient) {
  console.log('[Listener] 🎧 Starting Global Event Subscription...');

  let retryCount = 0;

  const connect = async () => {
    try {
      // 建立 WebSocket 长连接
      const events = await api.event.subscribe();
      console.log('[Listener] ✅ Connected to OpenCode Event Stream');
      retryCount = 0;

      for await (const event of events.stream) {
        if (event.type === 'message.part.updated') {
          const sessionId = event.properties.part.sessionID;
          const part = event.properties.part;

          if (!sessionId || !part) continue;

          const context = sessionToFeishuMap.get(sessionId);
          if (!context) continue;

          const msgId = part.messageID;

          if (part.type === 'text' || part.type === 'reasoning') {
            await handleStreamUpdate(feishu, context.chatId, msgId, part);
          } else if (part.type === 'tool') {
            if (part.state?.status === 'running') {
              console.log(`[Listener] 🔧 Tool Running: ${part.tool}`);
            }
          }
        } else if (event.type === 'session.deleted') {
          const sid = event.properties.info.id;
          if (sid) sessionToFeishuMap.delete(sid);
        } else if (event.type === 'session.error') {
          const sid = event.properties.sessionID;
          if (sid) sessionToFeishuMap.delete(sid);
        }
      }
    } catch (error) {
      console.error('[Listener] ❌ Stream Disconnected:', error);

      const delay = Math.min(5000 * (retryCount + 1), 60000);
      retryCount++;
      console.log(`[Listener] 🔄 Reconnecting in ${delay / 1000}s...`);
      setTimeout(connect, delay);
    }
  };

  connect();
}

async function handleStreamUpdate(feishu: FeishuClient, chatId: string, msgId: string, part: Part) {
  if (!msgId) return;

  if (part.type !== 'text' && part.type !== 'reasoning') {
    return;
  }

  let buffer = messageBuffers.get(msgId);
  if (!buffer) {
    buffer = {
      feishuMsgId: null,
      fullContent: '',
      type: part.type,
      lastUpdateTime: 0,
      isFinished: false,
    };
    messageBuffers.set(msgId, buffer);
  }

  if (part.text) {
    buffer.fullContent = part.text;
  }

  const now = Date.now();
  const shouldUpdate = !buffer.feishuMsgId || now - buffer.lastUpdateTime > UPDATE_INTERVAL;

  if (shouldUpdate && buffer.fullContent) {
    buffer.lastUpdateTime = now;

    let displayContent = buffer.fullContent;

    if (buffer.type === 'reasoning') {
      displayContent = `🤔 思考中...\n\n${displayContent}`;
    }

    try {
      if (!buffer.feishuMsgId) {
        const sentId = await feishu.sendMessage(chatId, displayContent);
        if (sentId) buffer.feishuMsgId = sentId;
      } else {
        await feishu.editMessage(chatId, buffer.feishuMsgId, displayContent);
      }
    } catch (e) {
      console.error(`[Listener] Failed to update Feishu msg:`, e);
    }
  }
}

const sessionCache = new Map<string, string>();

export const createMessageHandler = (api: OpenCodeApi, feishu: FeishuClient) => {
  return async (chatId: string, text: string, messageId: string, senderId: string) => {
    console.log(`[Bridge] 📥 Incoming: "${text}"`);

    if (text.trim().toLowerCase() === 'ping') {
      await feishu.sendMessage(chatId, 'Pong! ⚡️');
      return;
    }

    let reactionId: string | null = null;

    try {
      if (messageId) {
        reactionId = await feishu.addReaction(messageId, LOADING_EMOJI);
      }

      let sessionId = sessionCache.get(chatId);
      if (!sessionId) {
        const uniqueTitle = `Chat ${chatId.slice(-4)} [${new Date().toLocaleTimeString()}]`;
        const res = await api.createSession({ body: { title: uniqueTitle } });
        sessionId = res.data?.id;

        if (sessionId) {
          sessionCache.set(chatId, sessionId);
          console.log(`[Bridge] ✨ Created Session: ${sessionId}`);
        }
      }

      if (!sessionId) throw new Error('Failed to init Session');

      sessionToFeishuMap.set(sessionId, { chatId, senderId });

      await api.promptSession({
        path: { id: sessionId },
        body: { parts: [{ type: 'text', text: text }] },
      });

      console.log(`[Bridge] 🚀 Prompt Sent to ${sessionId}. Listener will handle the rest.`);
    } catch (error: any) {
      console.error('[Bridge] ❌ Error:', error);

      if (error.status === 404) {
        sessionCache.delete(chatId);
      }

      await feishu.sendMessage(chatId, `❌ Error: ${error.message || 'Request failed'}`);
    } finally {
      if (messageId && reactionId) {
        await feishu.removeReaction(messageId, reactionId).catch(() => {});
      }
    }
  };
};
