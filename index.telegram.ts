// index.telegram.ts (telegram-bridge placeholder)
import type { Plugin } from '@opencode-ai/plugin';
import { bridgeLogger } from './src/logger';

export const BridgePlugin: Plugin = async () => {
  bridgeLogger.info('[Plugin] telegram-bridge is not implemented yet.');
  return {};
};
