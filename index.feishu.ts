// index.feishu.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Config } from '@opencode-ai/sdk';
import type { BridgeAdapter, FeishuConfig } from './src/types';
import { globalState } from './src/utils';
import { bridgeLogger } from './src/logger';

const FEISHU_CONFIG_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.config/opencode/plugins/feishu.json'
);

interface FeishuConfigFile {
  app_id: string;
  app_secret: string;
  mode?: 'ws' | 'webhook';
  callback_url?: string;
  encrypt_key?: string;
  file_store_dir?: string;
  auto_send_local_files?: boolean;
  auto_send_local_files_allow_absolute?: boolean;
  auto_send_local_files_max_mb?: number;
}

let feishuAdapter: BridgeAdapter | null = globalState.__bridge_feishu_adapter || null;

function loadFeishuConfigFile(): FeishuConfigFile | null {
  try {
    if (!fs.existsSync(FEISHU_CONFIG_FILE)) {
      return null;
    }
    const content = fs.readFileSync(FEISHU_CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as FeishuConfigFile;
  } catch (error) {
    bridgeLogger.error('[Plugin] Failed to load feishu config file', error);
    return null;
  }
}

export function parseFeishuConfig(cfg: Config | undefined): FeishuConfig {
  const configFile = loadFeishuConfigFile();

  const app_id = configFile?.app_id ?? '';
  const app_secret = configFile?.app_secret ?? '';
  const mode = configFile?.mode === 'webhook' ? 'webhook' : 'ws';
  const callbackUrlRaw = configFile?.callback_url;
  const fileStoreDirRaw = configFile?.file_store_dir;

  const callbackUrl =
    typeof callbackUrlRaw === 'string' && callbackUrlRaw.length > 0
      ? callbackUrlRaw.startsWith('http')
        ? callbackUrlRaw
        : `http://${callbackUrlRaw}`
      : undefined;

  const file_store_dir =
    typeof fileStoreDirRaw === 'string' && fileStoreDirRaw.trim().length > 0
      ? fileStoreDirRaw.trim()
      : undefined;

  if (mode === 'webhook' && !callbackUrl) {
    bridgeLogger.warn('[Plugin] Missing callback_url for webhook mode');
  }

  if (!app_id || !app_secret) {
    const location = configFile ? FEISHU_CONFIG_FILE : 'opencode.json (agent.lark-bridge.options)';
    throw new Error(`[Plugin] Missing app_id or app_secret in ${location}`);
  }

  const maxMbRaw = Number(configFile?.auto_send_local_files_max_mb);
  const auto_send_local_files = configFile?.auto_send_local_files === true;
  const auto_send_local_files_allow_absolute = configFile?.auto_send_local_files_allow_absolute === true;
  const auto_send_local_files_max_mb = Number.isFinite(maxMbRaw) && maxMbRaw > 0 ? maxMbRaw : 20;

  return {
    app_id,
    app_secret,
    mode,
    callback_url: callbackUrl,
    file_store_dir,
    encrypt_key: configFile?.encrypt_key,
    auto_send_local_files,
    auto_send_local_files_allow_absolute,
    auto_send_local_files_max_mb,
  };
}
