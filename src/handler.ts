import type { TextPartInput } from '@opencode-ai/sdk';
import type { OpenCodeApi } from './opencode';
import type { FeishuClient } from './feishu';
import { LOADING_EMOJI } from './constants';

const sessionMap = new Map<string, string>();

export const createMessageHandler = (api: OpenCodeApi, feishu: FeishuClient) => {
  return async (chatId: string, text: string, messageId: string) => {
    if (text.trim().toLowerCase() === 'ping') {
      await feishu.sendMessage(chatId, 'Pong! ⚡️');
      return;
    }

    let reactionId: string | null = null;
    if (messageId) {
      reactionId = await feishu.addReaction(messageId, LOADING_EMOJI);
    }

    try {
      let sessionId = sessionMap.get(chatId);

      if (!sessionId) {
        const uniqueSessionTitle = `[Feishu] ${chatId}`;

        try {
          if (api.getSessionList) {
            const listRes = await api.getSessionList({});

            const sessions = Array.isArray(listRes) ? listRes : listRes.data || [];
            const existSession = sessions.find((s: any) => s.title === uniqueSessionTitle);

            if (existSession) {
              sessionId = existSession.id;
              console.log(`[Bridge] ♻️ 复用历史会话: ${sessionId} (${uniqueSessionTitle})`);
            }
          }
        } catch (e) {
          console.warn('[Bridge] 获取会话列表失败，将直接创建新会话', e);
        }

        if (!sessionId) {
          try {
            if (!api.createSession) throw new Error('SDK Method: sessionCreate not found');

            const reqData = {
              body: {
                title: uniqueSessionTitle,
              },
            };

            const res = await api.createSession(reqData);
            sessionId = res.id || res.data?.id;

            if (sessionId) {
              console.log(`[Bridge] ✨ 创建新会话: ${sessionId}`);
            }
          } catch (err) {
            console.error('[Bridge] Create Session Failed:', err);
            await feishu.sendMessage(chatId, '❌ 创建会话失败');
            return;
          }
        }

        if (sessionId) sessionMap.set(chatId, sessionId);
      }

      console.log(`[Bridge] 🚀 发送指令: "${text}"`);
      const parts: TextPartInput[] = [{ type: 'text', text: text }];

      try {
        if (!api.promptSession) throw new Error('SDK Method: sessionPrompt not found');

        await api.promptSession({
          path: { id: sessionId! },
          body: { parts: parts },
        });
      } catch (sendErr: any) {
        console.error('[Bridge] ❌ 发送接口报错:', sendErr);

        if (JSON.stringify(sendErr).includes('404') || sendErr.status === 404) {
          sessionMap.delete(chatId);
          await feishu.sendMessage(chatId, '⚠️ 当前会话已失效，正在重置，请重试');
        } else {
          await feishu.sendMessage(chatId, `❌ 发送失败: ${sendErr.message || 'API Error'}`);
        }
        return;
      }

      if (!api.getMessages) return;

      let attempts = 0;
      const maxAttempts = 60;

      await new Promise<void>(resolve => {
        const pollTimer = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            clearInterval(pollTimer);
            await feishu.sendMessage(chatId, '❌ AI 响应超时');
            resolve();
            return;
          }

          try {
            await api
              .getMessages({
                path: { id: sessionId! },
                query: { limit: 10 } as any,
              })
              .then((res: any) => {
                const messages = Array.isArray(res) ? res : res.data || [];
                if (messages.length === 0) return;

                const lastItem = messages[messages.length - 1];
                const info = lastItem.info;

                if (info.role === 'assistant' && !info.error) {
                  clearInterval(pollTimer);

                  let replyText = '';
                  if (lastItem.parts && lastItem.parts.length > 0) {
                    replyText = lastItem.parts
                      .filter((p: any) => p.type === 'text')
                      .map((p: any) => p.text)
                      .join('\n');
                  }

                  console.log(`[Bridge] ✅ 收到回复 (${replyText.length} chars)`);
                  feishu.sendMessage(chatId, replyText || '(AI 回复了空内容)'); // 这里不需要 await
                  resolve();
                } else if (info.error) {
                  clearInterval(pollTimer);
                  const errMsg = typeof info.error === 'string' ? info.error : info.error.message;
                  console.error('[Bridge] AI Error:', info.error);
                  feishu.sendMessage(chatId, `❌ AI 错误: ${errMsg}`);
                  resolve();
                }
              });
          } catch (e) {}
        }, 1500);
      });
    } catch (error: any) {
      console.error('[Bridge] Fatal Logic Error:', error);
      await feishu.sendMessage(chatId, `❌ System Error: ${error.message}`);
    } finally {
      if (messageId && reactionId) {
        await feishu.removeReaction(messageId, reactionId);
      }
    }
  };
};
