import * as fs from 'node:fs';
import * as path from 'node:path';
import { Config } from '@opencode-ai/sdk';
import type { BridgeGlobalState } from './global.state';
import { BRIDGE_AGENT_IDS, UPDATE_INTERVAL } from './constants';

const FEISHU_CONFIG_FILE = path.join(process.env.HOME || '', '.config/opencode/plugins/feishu.json');

export const globalState = globalThis as BridgeGlobalState;
export const runtimeInstanceId = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

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

export function isEnabled(cfg: Config | undefined, key: string): boolean {
  const node = cfg?.agent?.[key];
  if (!node) return false;
  if (node.disable === true) return false;
  return true;
}

export function isFeishuConfigAvailable(): boolean {
  try {
    if (!fs.existsSync(FEISHU_CONFIG_FILE)) return false;
    const content = fs.readFileSync(FEISHU_CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content);
    return !!(config.app_id && config.app_secret);
  } catch {
    return false;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getUpdateIntervalByAdapter(_adapterKey?: string): number {
  return UPDATE_INTERVAL;
}

export function isBridgeAgentId(value: string): boolean {
  return BRIDGE_AGENT_IDS.includes(value as (typeof BRIDGE_AGENT_IDS)[number]);
}
export function sanitizeTemplateMarkers(text: string): string {
  // Feishu interactive cards treat `{{...}}` as template variables.
  // Runtime content may contain these literally (e.g. code snippets), which causes 201008.
  return text.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
}
