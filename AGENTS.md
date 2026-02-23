# AGENTS.md - Message Bridge OpenCode Plugin

Guidelines for coding agents working on **opencode-feishu**.

## Project Overview

TypeScript plugin for OpenCode that bridges AI agent conversations to messaging platforms (Feishu/Lark) via the adapter pattern. Runtime: Node.js / Bun. Requires `@opencode-ai/plugin` and `@opencode-ai/sdk` v1.1.48+.

## Build & Development

```bash
# Install dependencies
bun install          # or: npm install

# Build (compiles TS to dist/ via tsc)
npm run build        # or: bun run build

# Type-check only (no emit)
npx tsc --noEmit
```

**No test framework, linter, or formatter is configured.** TypeScript strict mode (`strict: true`) is the primary code quality gate. Always run `npx tsc --noEmit` to verify changes compile cleanly.

**Running the plugin** -- reference it in `opencode.json` then start OpenCode:
```json
{ "plugin": ["/absolute/path/to/opencode-feishu"] }
```
```bash
opencode web   # or: opencode tui
```

**Debugging:** set `BRIDGE_DEBUG=true` and check `logs/bridge.log` (`tail -f logs/bridge.log`).

## Project Structure

```
index.ts                  # Plugin entry point (exports BridgePlugin)
index.feishu.ts           # Feishu config parser
src/
  types.ts                # Core interfaces: BridgeAdapter, FeishuConfig, etc.
  utils.ts                # Utility functions, globalState
  logger.ts               # Unified logging (bridgeLogger)
  global.state.ts         # Cross-request global state
  constants/index.ts      # Constants (AGENT_LARK, limits, intervals)
  handler/
    index.ts              # Exports startGlobalEventListener, createIncomingHandler
    command.ts            # Slash command dispatch (/help, /model, /file, etc.)
    mux.ts                # AdapterMux - routes messages to correct adapter
    incoming.flow.ts      # Incoming message processing
    event.flow.ts         # OpenCode session event streaming
    execution.flow.ts     # Execution status card management
    message.delivery.ts   # Message edit/flush/retry logic
    question.proxy.ts     # Interactive question proxy
  bridge/
    file.store.ts         # File upload/download with caching
    outgoing.file.ts      # Detect & upload file refs in AI responses
    buffer.ts             # Stream message accumulation & truncation
  feishu/
    feishu.adapter.ts     # BridgeAdapter implementation for Feishu
    feishu.client.ts      # Feishu REST API client (~1200 lines)
    feishu.renderer.ts    # Interactive card builder
    patch.ts              # Direct API calls bypassing SDK
```

## Code Style

### Imports

Order: Node.js built-ins -> external packages -> `@opencode-ai/*` -> internal modules. Use `node:` prefix for built-ins. Use `import type` for type-only imports.

```typescript
import * as fs from 'node:fs';
import axios from 'axios';
import type { Plugin } from '@opencode-ai/plugin';
import { bridgeLogger } from '../logger';
import type { BridgeAdapter } from '../types';
```

### TypeScript & Types

- Strict mode is on -- no implicit `any`, explicit return types on exported functions.
- Use `interface` for public contracts (e.g., `BridgeAdapter`), `type` for config objects and unions.
- Use `?` for optional interface methods, not `| undefined`.

### Naming

| Thing             | Convention          | Example                          |
|-------------------|---------------------|----------------------------------|
| Files             | `kebab-case.ts`     | `feishu.adapter.ts`              |
| Classes           | `PascalCase`        | `FeishuAdapter`                  |
| Functions/vars    | `camelCase`         | `sendMessage`, `createHandler`   |
| Constants         | `UPPER_SNAKE_CASE`  | `AGENT_LARK`, `UPDATE_INTERVAL`  |
| Types/Interfaces  | `PascalCase`        | `BridgeAdapter`, `FeishuConfig`  |
| Private members   | `private` keyword   | `private client: FeishuClient`   |

### Error Handling

- Always use `async/await`, never `.then()/.catch()` chains.
- Wrap fallible operations in `try/catch`.
- **Recoverable failures**: log with `bridgeLogger.error()`, return `null` or `false`.
- **Unrecoverable failures**: throw and let the caller handle.
- Never use `console.log/error` -- use `bridgeLogger` exclusively.

```typescript
// Recoverable
async sendMessage(chatId: string, text: string): Promise<string | null> {
  try {
    const result = await this.client.send(chatId, text);
    return result.id;
  } catch (error) {
    bridgeLogger.error('[Feishu] send failed', error);
    return null;
  }
}
```

### Logging

Use `bridgeLogger` from `src/logger.ts`. Include a bracketed component tag and structured context:

```typescript
bridgeLogger.info(`[Feishu] outgoing files chat=${chatId} sent=${count}`);
bridgeLogger.error('[Command] execution failed', error);
```

Tags: `[Plugin]`, `[Feishu]`, `[Command]`, `[Delivery]`, `[FileStore]`, etc.

### Comments

Prefer self-documenting code. Comment only to explain *why*, not *what*:

```typescript
// Feishu treats {{...}} as template variables, escape them
return text.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
```

## Architecture

### Adapter Pattern

Every platform implements `BridgeAdapter` (defined in `src/types.ts`). The `AdapterMux` in `src/handler/mux.ts` routes messages to the correct adapter by key.

### Global State

Cross-request state lives on `globalState` (`src/utils.ts`): adapter instances, session/chat mappings, pending question queues. Access via `globalState.__bridge_mux`, `globalState.__bridge_adapter_instances`, etc.

### Adding a New Adapter

1. Create `src/your-platform/` with `*.adapter.ts`, `*.client.ts`, `*.renderer.ts`
2. Add config parser in `index.your-platform.ts`
3. Add constant in `src/constants/index.ts`
4. Register in `index.ts` within the `adaptersToStart` array

### Adding Slash Commands

Add a new `if (normalizedCommand === 'yourcommand')` branch in `src/handler/command.ts`.

## Key Files to Read First

1. `src/types.ts` -- all core interfaces
2. `index.ts` -- plugin bootstrap and adapter registration
3. `src/handler/incoming.flow.ts` -- message flow from platform to OpenCode
4. `src/handler/event.flow.ts` -- event flow from OpenCode back to platform
5. `src/feishu/feishu.adapter.ts` -- reference adapter implementation
