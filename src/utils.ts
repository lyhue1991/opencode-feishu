// src/utils.ts
import type { BridgeGlobalState } from './global.state';

export const globalState = globalThis as BridgeGlobalState;

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const DEFAULT_MAX_FILE_MB = 10;
export const DEFAULT_MAX_FILE_RETRY = 3;
export const ERROR_HEADER = '## Error';

export function parseSlashCommand(text: string): { command: string; arguments: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed === '/') return null;

  const match = trimmed.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;

  const command = match[1]?.trim();
  if (!command) return null;

  const args = (match[2] ?? '').trim();
  return { command, arguments: args };
}
