// index.ts
import type { Plugin } from '@opencode-ai/plugin';
import type { Config } from '@opencode-ai/sdk';

import { globalState } from './src/utils';
import { AGENT_LARK, AGENT_IMESSAGE, AGENT_TELEGRAM } from './src/constants';

import { AdapterMux } from './src/handler/mux';
import { startGlobalEventListener, createIncomingHandler } from './src/handler';

import { FeishuAdapter } from './src/feishu/feishu.adapter';
import type { FeishuConfig, BridgeAdapter } from './src/types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// isEnabled
function isEnabled(cfg: Config | undefined, key: string): boolean {
  const node = cfg?.agent?.[key];
  if (!node) return false;
  if (node.disable === true) return false;
  return true;
}

function parseFeishuConfig(cfg: Config | undefined): FeishuConfig {
  const node = cfg?.agent?.[AGENT_LARK];
  const options = asRecord(node?.options);

  const app_id = typeof options.app_id === 'string' ? options.app_id : '';
  const app_secret = typeof options.app_secret === 'string' ? options.app_secret : '';
  const mode = options.mode === 'webhook' ? 'webhook' : 'ws';
  const callbackUrlRaw = options.callback_url;
  const callbackUrl =
    typeof callbackUrlRaw === 'string' && callbackUrlRaw.length > 0
      ? callbackUrlRaw.startsWith('http')
        ? callbackUrlRaw
        : `http://${callbackUrlRaw}`
      : undefined;

  if (mode === 'webhook' && !callbackUrl) {
    console.error(`[Plugin] Missing callback_url for ${AGENT_LARK} in webhook mode`);
  }

  if (!app_id || !app_secret) {
    throw new Error(`[Plugin] Missing options for ${AGENT_LARK}: app_id/app_secret`);
  }

  return {
    app_id,
    app_secret,
    mode,
    callback_url: callbackUrl,
    encrypt_key: typeof options.encrypt_key === 'string' ? options.encrypt_key : undefined,
  };
}

export const BridgePlugin: Plugin = async ctx => {
  const { client } = ctx;
  console.log('[Plugin] BridgePlugin entry initializing...');

  const bootstrap = async () => {
    try {
      const raw = await client.config.get();
      const cfg = raw?.data;

      // mux 单例
      const mux: AdapterMux = globalState.__bridge_mux || new AdapterMux();
      globalState.__bridge_mux = mux;

      // 允许多个 adapter 同时启用
      const adaptersToStart: Array<{ key: string; adapter: BridgeAdapter }> = [];

      if (isEnabled(cfg, AGENT_LARK)) {
        const feishuCfg = parseFeishuConfig(cfg);
        adaptersToStart.push({ key: AGENT_LARK, adapter: new FeishuAdapter(feishuCfg) });
      }

      if (isEnabled(cfg, AGENT_IMESSAGE)) {
        console.log('[Plugin] imessage-bridge enabled (not implemented yet).');
        // TODO: mux.register(AGENT_IMESSAGE, new IMessageAdapter(...))
      }

      if (isEnabled(cfg, AGENT_TELEGRAM)) {
        console.log('[Plugin] telegram-bridge enabled (not implemented yet).');
        // TODO: mux.register(AGENT_TELEGRAM, new TelegramAdapter(...))
      }

      if (adaptersToStart.length === 0) {
        console.log('[Plugin] No bridge enabled.');
        return;
      }

      // 注册 + start（incoming）
      for (const { key, adapter } of adaptersToStart) {
        mux.register(key, adapter);
        const incoming = createIncomingHandler(client, mux, key);
        await adapter.start(incoming);
        console.log(`[Plugin] ✅ Started adapter: ${key}`);
      }

      // 全局 listener 只启动一次（mux）
      if (!globalState.__bridge_listener_started) {
        globalState.__bridge_listener_started = true;
        startGlobalEventListener(client, mux).catch(err => {
          console.error('[Plugin] ❌ startGlobalEventListener failed:', err);
          globalState.__bridge_listener_started = false;
        });
      } else {
        console.log('[Plugin] Global listener already started.');
      }

      console.log('[Plugin] ✅ BridgePlugin ready.');
    } catch (e) {
      console.error('[Plugin] Bootstrap error:', e);
    }
  };

  bootstrap();
  return {};
};
