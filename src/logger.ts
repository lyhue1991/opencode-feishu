import * as fs from 'node:fs';
import * as path from 'node:path';

export type BridgeLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// 检测 OpenCode 运行模式
function detectOpencodeMode(): 'web' | 'tui' | 'unknown' {
  // 检查环境变量
  if (process.env.OPENCODE_MODE) {
    const mode = String(process.env.OPENCODE_MODE).toLowerCase();
    if (mode.includes('web')) return 'web';
    if (mode.includes('tui')) return 'tui';
  }

  // 检查进程参数
  const args = process.argv.slice(1).join(' ').toLowerCase();
  if (args.includes('web')) return 'web';
  if (args.includes('tui')) return 'tui';

  // 检查进程标题
  const title = process.title.toLowerCase();
  if (title.includes('web')) return 'web';
  if (title.includes('tui')) return 'tui';

  return 'unknown';
}

const logFilePath =
  process.env.BRIDGE_LOG_FILE || path.join(process.cwd(), 'logs', 'bridge.log');

// 根据模式决定是否输出到 stdout
const opencodeMode = detectOpencodeMode();
const isTuiMode = opencodeMode === 'tui';

// 优先级：环境变量 > 自动检测
// 在 TUI 模式下默认禁用 stdout，除非显式设置 BRIDGE_LOG_STDOUT=true
// 在 Web 模式下默认启用 stdout
const stdoutEnabled = (() => {
  const envValue = process.env.BRIDGE_LOG_STDOUT;
  if (envValue !== undefined) {
    return !['0', 'false', 'off', 'no'].includes(String(envValue).toLowerCase());
  }
  // 自动检测：TUI 模式禁用，其他模式启用
  return !isTuiMode;
})();

const debugEnabled = !['0', 'false', 'off', 'no'].includes(
  String(process.env.BRIDGE_DEBUG || 'false').toLowerCase(),
);

function formatLine(level: BridgeLogLevel, message: string): string {
  const levelEmoji =
    level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'DEBUG' ? '🪵' : 'ℹ️';
  let tagEmoji = '🔹';
  if (message.includes('[Incoming]')) tagEmoji = '📥';
  else if (message.includes('[Command]')) tagEmoji = '🧭';
  else if (message.includes('[Listener]')) tagEmoji = '🎧';
  else if (message.includes('[Plugin]')) tagEmoji = '🧩';
  else if (message.includes('[BridgeFlow]') || message.includes('[BridgeFlowDebug]')) tagEmoji = '⚙️';
  else if (message.includes('[Feishu]')) tagEmoji = '🪶';
  else if (message.includes('[FileStore]')) tagEmoji = '📁';
  return `[${new Date().toISOString()}] ${levelEmoji}  ${tagEmoji} [${level}] ${message}`;
}

function writeLine(line: string): void {
  try {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.appendFileSync(logFilePath, `${line}\n`, 'utf8');
  } catch {}
}

function stringifyMeta(meta: unknown): string {
  if (meta === undefined) return '';
  if (typeof meta === 'string') return meta;
  if (meta instanceof Error) return `${meta.name}: ${meta.message}\n${meta.stack || ''}`;
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

function log(level: BridgeLogLevel, message: string, meta?: unknown): void {
  const line = formatLine(level, message);
  const metaText = stringifyMeta(meta);
  const fullLine = metaText ? `${line} ${metaText}` : line;
  if (stdoutEnabled) {
    if (level === 'ERROR') console.error(fullLine);
    else if (level === 'WARN') console.warn(fullLine);
    else console.log(fullLine);
  }
  writeLine(fullLine);
}

export function getBridgeLogFilePath(): string {
  return logFilePath;
}

export const bridgeLogger = {
  debug(message: string, meta?: unknown) {
    if (!debugEnabled) return;
    log('DEBUG', message, meta);
  },
  info(message: string, meta?: unknown) {
    log('INFO', message, meta);
  },
  warn(message: string, meta?: unknown) {
    log('WARN', message, meta);
  },
  error(message: string, meta?: unknown) {
    log('ERROR', message, meta);
  },
};
