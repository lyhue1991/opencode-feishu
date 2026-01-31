import type { Plugin } from '@opencode-ai/plugin';
import { FeishuClient } from './src/feishu';
import { buildOpenCodeApi } from './src/opencode';
import { createMessageHandler } from './src/handler';
import type { FeishuConfig } from './src/types';
import type { Config } from '@opencode-ai/sdk';
import { PLUGIN_CONFIG_NAME } from 'src/constants';

export const FeishuBridgePlugin: Plugin = async ctx => {
  const { client } = ctx;

  console.log('[Plugin] Plugin Loaded. Starting bootstrap in background...');

  const bootstrap = async () => {
    try {
      console.log('[Plugin] Attempting to read config...');

      const configPromise = client.config.get();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Config API Timeout')), 3000),
      );

      let fullConfig: any = {};
      try {
        fullConfig = await Promise.race([configPromise, timeoutPromise]);
        console.log('[Plugin] Config read success.');
      } catch (e) {
        console.warn('[Plugin] ⚠️ Config API read failed/timed out, falling back to Env.', e);
      }

      const agentConfig = fullConfig.data as Config;
      console.info('env', process.env);
      const pluginNameStr = PLUGIN_CONFIG_NAME;

      if (!pluginNameStr) {
        console.error(`[Plugin] ❌ 启动失败: 未找PLUGIN_CONFIG_NAME！请检查 .env`);
        return;
      }
      const larkConfig = agentConfig?.agent?.[pluginNameStr]?.options as Record<string, any>;

      const appId = larkConfig.app_id;
      const appSecret = larkConfig.app_secret;

      if (!appId || !appSecret) {
        console.error(
          `[Plugin] ❌ 启动失败: 未找到配置！请检查 ~/.config/opencode/opencode.json 的 "agent.lark-bridge" 字段或者设置环境变量。`,
        );
        return;
      }

      const config: FeishuConfig = { appId, appSecret };

      // 初始化依赖
      const api = buildOpenCodeApi(client);
      const feishuClient = new FeishuClient(config);
      const messageHandler = createMessageHandler(api, feishuClient);

      // 启动监听
      await feishuClient.startListener(messageHandler);
      console.log('[Plugin] 🚀 Feishu Bridge Service Started!');
    } catch (error) {
      console.error('[Plugin] ❌ Bootstrap Error:', error);
    }
  };

  bootstrap();

  return {
    'permission.ask': async (input, output) => {
      output.status = 'allow';
    },
  };
};
