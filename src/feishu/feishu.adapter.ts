import type { BridgeAdapter, FeishuConfig, IncomingMessageHandler } from '../types';
import { FeishuClient } from './feishu.client';
import { FeishuRenderer, extractFilesFromHandlerMarkdown, RenderedFile } from './feishu.renderer';

function clip(s: string, n = 8000) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + `\n... (clipped, len=${s.length})` : s;
}

export class FeishuAdapter implements BridgeAdapter {
  private client: FeishuClient;
  private renderer: FeishuRenderer;
  private config: FeishuConfig;
  private sentFilesByMessage: Map<string, Set<string>>;

  constructor(config: FeishuConfig) {
    this.config = config;
    this.client = new FeishuClient(config);
    this.renderer = new FeishuRenderer();
    this.sentFilesByMessage = new Map();
  }

  async start(onMessage: IncomingMessageHandler): Promise<void> {
    if (this.config.mode === 'webhook') {
      await this.client.startWebhook(onMessage);
    } else {
      await this.client.startWebSocket(onMessage);
    }
  }

  async stop(): Promise<void> {
    await this.client.stop();
  }

  async sendMessage(chatId: string, text: string): Promise<string | null> {
    const files = extractFilesFromHandlerMarkdown(text);
    const sentSignatures = await this.sendNewFiles(chatId, files, undefined);
    const messageId = await this.client.sendMessage(chatId, this.renderer.render(text));
    if (messageId && sentSignatures.size > 0) {
      this.sentFilesByMessage.set(messageId, sentSignatures);
    }
    return messageId;
  }

  async editMessage(chatId: string, messageId: string, text: string): Promise<boolean> {
    const files = extractFilesFromHandlerMarkdown(text);
    const sent = this.sentFilesByMessage.get(messageId);
    const newSent = await this.sendNewFiles(chatId, files, sent);
    if (newSent.size > 0) {
      const merged = new Set([...(sent || []), ...newSent]);
      this.sentFilesByMessage.set(messageId, merged);
    }
    return this.client.editMessage(chatId, messageId, this.renderer.render(text));
  }

  async addReaction(messageId: string, emojiType: string): Promise<string | null> {
    return this.client.addReaction(messageId, emojiType);
  }

  async removeReaction(messageId: string, reactionId: string): Promise<void> {
    await this.client.removeReaction(messageId, reactionId);
  }

  private fileSignature(file: RenderedFile): string {
    const s = `${file.filename || ''}|${file.mime || ''}|${file.url || ''}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return String(h);
  }

  private async sendNewFiles(
    chatId: string,
    files: RenderedFile[],
    sent?: Set<string>
  ): Promise<Set<string>> {
    const sentNow = new Set<string>();
    for (const f of files) {
      if (!f.url) continue;
      const sig = this.fileSignature(f);
      if (sent?.has(sig)) continue;
      const ok = await this.client.sendFileAttachment(chatId, f);
      if (ok) sentNow.add(sig);
    }
    return sentNow;
  }

}
