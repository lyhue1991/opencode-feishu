# AGENTS.md - Message Bridge OpenCode Plugin

This document provides guidelines for coding agents working on the **message-bridge-opencode-plugin** codebase.

## Project Overview

This is a universal message bridge plugin for OpenCode that enables AI agents to connect with multiple messaging platforms (Feishu/Lark, Telegram, iMessage) through a unified abstraction layer.

- **Language**: TypeScript
- **Runtime**: Node.js (designed for Bun compatibility)
- **Main Plugin File**: `index.ts`
- **Architecture**: Adapter pattern with platform-specific implementations

## Build & Development Commands

### Build
```bash
npm run build
# or
bun run build
```
Compiles TypeScript to `dist/` directory using `tsc`.

### Install Dependencies
```bash
bun install
# or
npm install
```

### Run (Development Mode)
The plugin is loaded by OpenCode. Reference it in `opencode.json`:
```json
{
  "plugin": ["/absolute/path/to/message-bridge-opencode-plugin"]
}
```

Then start OpenCode:
```bash
opencode web
# or
opencode tui
```

### Testing
**Note**: No test files currently exist in this repository.
- Test files would use pattern: `*.test.ts` or `*.spec.ts`
- To run tests (when implemented): `npm test` or `bun test`

### Linting
No linter configuration found. Follow TypeScript strict mode rules (enabled in tsconfig.json).

## Code Style Guidelines

### File Organization

```
.
├── index.ts                 # Main plugin entry
├── index.feishu.ts          # Feishu config parser
├── index.telegram.ts        # Telegram config parser
├── src/
│   ├── types.ts             # Core type definitions
│   ├── utils.ts             # Utility functions
│   ├── logger.ts            # Logging system
│   ├── constants/           # Constants and configurations
│   ├── handler/             # Message and command handlers
│   ├── bridge/              # File handling and buffering
│   ├── feishu/              # Feishu adapter implementation
│   ├── telegram/            # Telegram adapter implementation
│   └── imessage/            # iMessage adapter (WIP)
```

### Import Conventions

**Order**: External → OpenCode SDK → Internal (absolute paths)

```typescript
// ✅ Good
import * as path from 'node:path';
import axios from 'axios';
import type { Plugin } from '@opencode-ai/plugin';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { bridgeLogger } from '../logger';
import type { BridgeAdapter } from '../types';

// ❌ Bad - mixed order
import { bridgeLogger } from '../logger';
import * as path from 'node:path';
```

**Prefer Node.js built-in prefix**: Use `node:` prefix for Node.js modules
```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
```

**Type imports**: Use `type` keyword for type-only imports
```typescript
import type { Plugin } from '@opencode-ai/plugin';
import type { BridgeAdapter, FeishuConfig } from '../types';
```

### TypeScript & Types

**Strict mode enabled** - all strict checks are on:
```typescript
// ✅ Always define types explicitly
function parseCommand(text: string): { command: string; arguments: string } | null {
  // implementation
}

// ❌ Avoid implicit any
function parseCommand(text) { // Bad
```

**Use interface for public contracts, type for unions/intersections**:
```typescript
// ✅ Interface for adapter contracts
export interface BridgeAdapter {
  start(onMessage: IncomingMessageHandler): Promise<void>;
  stop?(): Promise<void>;
  sendMessage(chatId: string, text: string): Promise<string | null>;
}

// ✅ Type for configuration objects
export type FeishuConfig = {
  app_id: string;
  app_secret: string;
  mode: 'ws' | 'webhook';
};
```

**Optional methods**: Use `?` for optional interface methods
```typescript
export interface BridgeAdapter {
  addReaction?(messageId: string, emojiType: string): Promise<string | null>;
}
```

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `feishu.adapter.ts`, `message.delivery.ts`)
- **Classes**: `PascalCase` (e.g., `FeishuAdapter`, `TelegramClient`)
- **Functions/Variables**: `camelCase` (e.g., `sendMessage`, `createHandler`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `AGENT_LARK`, `UPDATE_INTERVAL`)
- **Types/Interfaces**: `PascalCase` (e.g., `BridgeAdapter`, `IncomingMessageHandler`)
- **Private class members**: prefix with `private` keyword (no underscore prefix)

```typescript
// ✅ Good
export const AGENT_LARK = 'lark-bridge';
class FeishuAdapter {
  private client: FeishuClient;
  private config: FeishuConfig;
}

// ❌ Bad
const agent_lark = 'lark-bridge';
class feishuAdapter {
  private _client: FeishuClient;
}
```

### Async/Await & Error Handling

**Always use async/await** over raw Promises:
```typescript
// ✅ Good
async function sendMessage(chatId: string, text: string): Promise<string | null> {
  try {
    const result = await this.client.send(chatId, text);
    return result.id;
  } catch (error) {
    bridgeLogger.error('[Adapter] send failed', error);
    return null;
  }
}

// ❌ Bad - using .then/.catch
function sendMessage(chatId: string, text: string) {
  return this.client.send(chatId, text)
    .then(result => result.id)
    .catch(() => null);
}
```

**Error handling patterns**:
- Use try/catch for operations that may fail
- Log errors with `bridgeLogger.error(message, error)`
- Return `null` or `false` for recoverable failures
- Throw for unrecoverable errors (let caller handle)

```typescript
// Recoverable - return null
async sendMessage(chatId: string, text: string): Promise<string | null> {
  try {
    return await this.client.send(chatId, text);
  } catch (err) {
    bridgeLogger.error('[Adapter] send failed', err);
    return null;
  }
}

// Unrecoverable - throw
async start(onMessage: IncomingMessageHandler): Promise<void> {
  if (!this.config.bot_token) {
    throw new Error('bot_token is required');
  }
  await this.client.start(onMessage);
}
```

### Logging

Use the unified logger from `src/logger.ts`:

```typescript
import { bridgeLogger } from '../logger';

// Available levels: debug, info, warn, error
bridgeLogger.debug('[Component] debug message', metadata);
bridgeLogger.info('[Component] info message');
bridgeLogger.warn('[Component] warning message', error);
bridgeLogger.error('[Component] error message', error);
```

**Logging conventions**:
- Include component tag: `[Feishu]`, `[Telegram]`, `[Command]`, `[Plugin]`
- Include context: `adapter=${key} chat=${chatId}`
- Use structured logging for errors (pass error as second argument)
- Clip large strings in logs using utility function

```typescript
// ✅ Good
bridgeLogger.info(`[Feishu] outgoing files chat=${chatId} sent=${count}`);
bridgeLogger.error('[Command] execution failed', error);

// ❌ Bad
console.log('sending files');
console.error(error);
```

### Comments & Documentation

- **JSDoc**: Not extensively used in this codebase
- **Inline comments**: Use sparingly, prefer self-documenting code
- **Complex logic**: Add explanatory comments for non-obvious behavior

```typescript
// ✅ Good - explains "why"
// Feishu treats {{...}} as template variables, escape them
return text.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');

// ❌ Bad - obvious from code
// Set the config
this.config = config;
```

## Architecture Patterns

### Adapter Pattern
Each platform implements the `BridgeAdapter` interface:
```typescript
export interface BridgeAdapter {
  start(onMessage: IncomingMessageHandler): Promise<void>;
  sendMessage(chatId: string, text: string): Promise<string | null>;
  editMessage(chatId: string, messageId: string, text: string): Promise<boolean>;
  // ... optional methods
}
```

### State Management
Use `globalState` for cross-request state:
```typescript
import { globalState } from './utils';

globalState.__bridge_mux = new AdapterMux();
globalState.__bridge_adapter_instances = new Map();
```

### Configuration Parsing
Platform configs are parsed in separate files:
- `index.feishu.ts` → `parseFeishuConfig()`
- `index.telegram.ts` → `parseTelegramConfig()`

## Important Notes

1. **No npm distribution yet**: Plugin must be used in development mode (local path)
2. **OpenCode compatibility**: Requires `@opencode-ai/plugin` and `@opencode-ai/sdk` v1.1.48+
3. **Logging**: All logs written to `logs/bridge.log` by default
4. **File handling**: Files uploaded to platforms stored in `bridge_files/` by default
5. **Multi-platform**: Multiple adapters can run simultaneously

## Common Tasks

### Adding a New Platform Adapter

1. Create adapter directory: `src/your-platform/`
2. Implement files:
   - `your-platform.adapter.ts` (implements `BridgeAdapter`)
   - `your-platform.client.ts` (platform API wrapper)
   - `your-platform.renderer.ts` (message formatting)
3. Create config parser: `index.your-platform.ts`
4. Register in `index.ts`:
   ```typescript
   if (isEnabled(cfg, AGENT_YOUR_PLATFORM)) {
     const config = parseYourPlatformConfig(cfg);
     adaptersToStart.push({
       key: AGENT_YOUR_PLATFORM,
       create: () => new YourPlatformAdapter(config)
     });
   }
   ```
5. Add constant to `src/constants/index.ts`

### Adding Slash Commands

Edit `src/handler/command.ts`:
```typescript
if (normalizedCommand === 'yourcommand') {
  // Implementation
  await sendCommandMessage('Response');
  return true;
}
```

### Debugging

Enable debug logs:
```bash
BRIDGE_DEBUG=true opencode web
```

Check logs:
```bash
tail -f logs/bridge.log
```

---

**Last Updated**: 2026-02-10
**Plugin Version**: 1.0.0
**Target OpenCode Version**: 1.1.48+
