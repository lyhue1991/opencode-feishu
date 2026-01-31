import * as lark from '@larksuiteoapi/node-sdk';
import type { FeishuConfig } from './types'; // 引入上面定义的类型
import { globalState, processedMessageIds } from './utils';

type MessageHandler = (chatId: string, text: string, messageId: string) => Promise<void>;

/**
 * 飞书客户端封装类
 * 这样设计后，配置由外部传入，不再硬编码
 */
export class FeishuClient {
  private apiClient: lark.Client;
  private config: FeishuConfig;
  private wsClient: lark.WSClient | null = null;

  constructor(config: FeishuConfig) {
    this.config = config;
    // 初始化 API Client
    this.apiClient = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
    });
  }

  private isMessageProcessed(messageId: string): boolean {
    if (processedMessageIds.has(messageId)) {
      console.log(`[Feishu] 🚫 忽略重复消息: ${messageId}`);
      return true;
    }
    processedMessageIds.add(messageId);
    if (processedMessageIds.size > 1000) {
      const first = processedMessageIds.values().next().value;
      processedMessageIds.delete(first);
    }
    return false;
  }

  private parseAndCleanContent(contentJson: string, mentions?: any[]): string {
    try {
      const content = JSON.parse(contentJson);
      let text = content.text || '';
      if (mentions && mentions.length > 0) {
        text = text.replace(/@\S+\s*/g, '').trim();
      }
      return text.trim();
    } catch (e) {
      console.error('[Feishu] ⚠️ 消息解析失败:', e);
      return '';
    }
  }

  public async sendMessage(chatId: string, text: string) {
    try {
      await this.apiClient.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });
    } catch (error) {
      console.error('[Feishu] 发送消息失败:', error);
    }
  }

  public async addReaction(messageId: string, emojiType: string): Promise<string | null> {
    try {
      const res = await this.apiClient.im.messageReaction.create({
        path: { message_id: messageId },
        data: { reaction_type: { emoji_type: emojiType } },
      });
      return res.data?.reaction_id || null;
    } catch (error) {
      return null;
    }
  }

  public async removeReaction(messageId: string, reactionId: string) {
    if (!reactionId) return;
    try {
      await this.apiClient.im.messageReaction.delete({
        path: { message_id: messageId, reaction_id: reactionId },
      });
    } catch (error) {
      // ignore
    }
  }

  public async startListener(onMessage: MessageHandler) {
    // 检查旧连接 (全局单例检查)
    if (globalState.__feishu_ws_client_instance) {
      console.log('[Feishu] ⚠️ 检测到旧连接，跳过启动');
      return;
    }

    console.log('[Feishu] 正在启动 WebSocket...');

    this.wsClient = new lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      loggerLevel: lark.LoggerLevel.info,
    });

    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async data => {
        const chatId = data.message.chat_id;
        const messageId = data.message.message_id;

        if (this.isMessageProcessed(messageId)) return;

        const text = this.parseAndCleanContent(data.message.content, data.message.mentions);
        if (!text) return;

        console.log(`[Feishu] 收到: ${text} (ID: ${messageId})`);
        await onMessage(chatId, text, messageId);
      },
    });

    await this.wsClient.start({ eventDispatcher });

    // 保存到全局，防止热重载重复
    globalState.__feishu_ws_client_instance = this.wsClient;
    console.log('✅ 飞书 WebSocket 连接成功！');
  }
}
