import type { Plugin } from '@opencode-ai/plugin';
import type { Config } from '@opencode-ai/sdk';
import { FeishuClient } from './src/feishu';
import { buildOpenCodeApi } from './src/opencode';
import { createMessageHandler } from './src/handler';
import type { FeishuConfig } from './src/types';
import { PLUGIN_CONFIG_NAME } from './src/constants';

export const FeishuBridgePlugin: Plugin = async ctx => {
  const { client } = ctx;

  console.log('[Plugin] Plugin Loaded.');

  const bootstrap = async () => {
    try {
      // 1. 获取配置
      const configPromise = client.config.get();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Config Timeout')), 1000),
      );

      let rawResponse: any = null;
      try {
        rawResponse = await Promise.race([configPromise, timeoutPromise]);
      } catch (e) {
        console.error('[Plugin] Config API Failed', e);
      }

      const agentConfig = (rawResponse?.data || rawResponse || {}) as Config;
      const larkConfig = (agentConfig?.agent?.[PLUGIN_CONFIG_NAME]?.options || {}) as Record<
        string,
        any
      >;

      const appId = larkConfig.app_id;
      const appSecret = larkConfig.app_secret;
      const mode = (larkConfig.mode || 'ws').toLowerCase();

      if (!appId || !appSecret) {
        console.error('[Plugin] ❌ Missing app_id or app_secret');
        return;
      }

      // 2. 初始化组件
      const config: FeishuConfig = {
        appId,
        appSecret,
        port: larkConfig.port ? parseInt(larkConfig.port, 10) : undefined,
        path: larkConfig.path,
        encryptKey: larkConfig.encrypt_key,
        mode: mode as 'ws' | 'webhook',
      };

      const api = buildOpenCodeApi(client);
      const feishuClient = new FeishuClient(config);

      // ✅ 还原：不需要传 directory
      const messageHandler = createMessageHandler(api, feishuClient);

      // 3. 启动服务
      if (config.mode === 'webhook') {
        await feishuClient.startWebhook(messageHandler);
      } else {
        await feishuClient.startWebSocket(messageHandler);
      }

      console.log(`[Plugin] 🚀 Service started in [${mode}] mode.`);
    } catch (error) {
      console.error('[Plugin] Bootstrap Error:', error);
    }
  };

  bootstrap();

  return {};
};
