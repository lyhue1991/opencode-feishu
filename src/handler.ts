import type { TextPartInput } from '@opencode-ai/sdk';
import type { OpenCodeApi } from './opencode';
import type { FeishuClient } from './feishu';
import { LOADING_EMOJI } from './constants';

const sessionMap = new Map<string, string>();
export const sessionOwnerMap = new Map<string, string>();

// 🟢 核心：并发锁队列
const chatQueues = new Map<string, Promise<void>>();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const createMessageHandler = (api: OpenCodeApi, feishu: FeishuClient) => {
  return async (chatId: string, text: string, messageId: string, senderId: string) => {
    console.log(`[Bridge] 📥 Received: "${text}"`);

    if (text.trim().toLowerCase() === 'ping') {
      await feishu.sendMessage(chatId, 'Pong! ⚡️');
      return;
    }

    // 🔒 队列锁：获取上一条任务
    const previousTask = chatQueues.get(chatId) || Promise.resolve();

    // 🔒 开启当前任务
    const currentTask = (async () => {
      // 等待上一条完成
      await previousTask.catch(() => {});

      let reactionId: string | null = null;
      try {
        if (messageId) {
          reactionId = await feishu.addReaction(messageId, LOADING_EMOJI);
        }

        // =========================================
        // 1. 获取或创建 Session (严格遵循 SDK 文档)
        // =========================================
        let sessionId = sessionMap.get(chatId);

        if (!sessionId) {
          // 加上时间戳，确保不混用旧会话
          const uniqueSessionTitle = `Feishu Chat ${chatId.slice(-4)} [${new Date().toLocaleTimeString()}]`;

          try {
            // ✅ 严格遵循 SDK：只传 title
            // 不传 mode，不传 directory，不传任何额外参数
            const res = await api.createSession({
              body: {
                title: uniqueSessionTitle,
              },
            });
            sessionId = res.id || res.data?.id;
            console.log(`[Bridge] ✨ Created Session: ${sessionId}`);
          } catch (createErr: any) {
            console.error('[Bridge] Failed to create session:', createErr);
            throw new Error('Could not create new session.');
          }

          if (sessionId) {
            sessionMap.set(chatId, sessionId);
            sessionOwnerMap.set(sessionId, senderId);
          }
        }

        if (!sessionId) throw new Error('No Session ID');

        // =========================================
        // 2. 发送消息 (严格遵循 SDK 文档)
        // =========================================
        console.log(`[Bridge] 🚀 Prompting AI...`);
        const parts: TextPartInput[] = [{ type: 'text', text: text }];

        try {
          // ✅ 严格遵循 SDK：只传 parts
          // 不传 agent，让后端使用 Default Model
          await api.promptSession({
            path: { id: sessionId },
            body: {
              parts: parts,
            },
          });
        } catch (err: any) {
          // 如果 Session 找不到了 (404)，清除缓存重试
          if (JSON.stringify(err).includes('404') || err.status === 404) {
            sessionMap.delete(chatId);
            throw new Error('Session expired. Please retry.');
          }
          throw err;
        }

        // =========================================
        // 3. 轮询回复 (贪婪模式防截断)
        // =========================================
        if (api.getMessages) {
          let replyText = '';
          let attempts = 0;

          while (attempts < 60) {
            attempts++;
            await sleep(1000);

            const res: any = await api.getMessages({
              path: { id: sessionId },
              query: { limit: 5 } as any,
            });

            const messages = Array.isArray(res) ? res : res.data || [];
            if (messages.length === 0) continue;

            const lastItem = messages[messages.length - 1];
            const info = lastItem.info || {};

            if (info.error) throw new Error(info.error.message || info.error);

            // 只要 assistant 有内容，就抓取
            if (info.role === 'assistant') {
              let currentText = '';
              if (lastItem.parts?.length > 0) {
                currentText = lastItem.parts
                  .filter((p: any) => p.type === 'text')
                  .map((p: any) => p.text)
                  .join('\n')
                  .trim();
              }

              if (currentText.length > 0) {
                replyText = currentText;
                break; // 成功获取
              }
            }
          }

          if (replyText) {
            console.log(`[Bridge] ✅ Reply sent (${replyText.length} chars)`);
            await feishu.sendMessage(chatId, replyText);
          } else {
            await feishu.sendMessage(chatId, '❌ AI Response Timeout');
          }
        }
      } catch (error: any) {
        console.error('[Bridge] Error:', error);
        await feishu.sendMessage(chatId, `⚠️ Error: ${error.message || 'Unknown error'}`);
      } finally {
        if (messageId && reactionId) {
          await feishu.removeReaction(messageId, reactionId);
        }
      }
    })();

    chatQueues.set(chatId, currentTask);
    return currentTask;
  };
};
