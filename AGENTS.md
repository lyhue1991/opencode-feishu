# AGENTS.md - Message Bridge OpenCode Plugin

TypeScript 插件，通过适配器模式将 AI Agent 对话桥接到消息平台（Feishu/Lark）。运行时: Node.js / Bun。需要 `@opencode-ai/plugin` 和 `@opencode-ai/sdk` v1.1.48+。

## 构建与测试

```bash
# 安装依赖
bun install          # 或: npm install

# 构建 (tsc 编译 TS 到 dist/)
npm run build        # 或: bun run build

# 类型检查 (仅检查，不输出)
npx tsc --noEmit
```

- **无测试框架**: 项目未配置测试_runner_。TypeScript 严格模式 (`strict: true`) 是主要的代码质量门禁。
- **调试**: 设置 `BRIDGE_DEBUG=true`，查看 `logs/bridge.log` (`tail -f logs/bridge.log`)

## 项目结构

```
index.ts                  # 插件入口，导出 BridgePlugin
index.feishu.ts           # Feishu 配置解析器
src/
  types.ts                # 核心接口: BridgeAdapter, FeishuConfig 等
  utils.ts                # 工具函数，globalState
  logger.ts               # 统一日志 (bridgeLogger)
  global.state.ts         # 跨请求全局状态
  constants/index.ts      # 常量 (AGENT_LARK, limits, intervals)
  handler/
    index.ts              # 导出 startGlobalEventListener, createIncomingHandler
    command.ts            # 斜杠命令分发 (/help, /model, /file 等)
    mux.ts                # AdapterMux - 按 key 路由消息到对应适配器
    incoming.flow.ts      # 平台到 OpenCode 的消息处理
    event.flow.ts         # OpenCode 到平台的事件流
    execution.flow.ts     # 执行状态卡片管理
    message.delivery.ts   # 消息编辑/刷新/重试逻辑
    question.proxy.ts     # 交互式问题代理
  bridge/
    file.store.ts        # 文件上传/下载与缓存
    outgoing.file.ts      # 检测并上传 AI 响应中的文件引用
    buffer.ts             # 流式消息累积与截断
  feishu/
    feishu.adapter.ts    # BridgeAdapter 的 Feishu 实现
    feishu.client.ts     # Feishu REST API 客户端
    feishu.renderer.ts   # 交互式卡片构建器
    patch.ts             # 绕过 SDK 的直接 API 调用
```

## 代码风格

### 导入顺序

Node.js 内置模块 -> 外部包 -> `@opencode-ai/*` -> 内部模块。使用 `node:` 前缀内置模块。类型-only 导入使用 `import type`。

```typescript
import * as fs from 'node:fs';
import axios from 'axios';
import type { Plugin } from '@opencode-ai/plugin';
import { bridgeLogger } from '../logger';
import type { BridgeAdapter } from '../types';
```

### TypeScript 与类型

- 启用严格模式 - 无隐式 `any`，导出函数必须有显式返回类型
- 公共契约使用 `interface`（如 `BridgeAdapter`），配置对象和联合类型使用 `type`
- 可选接口方法使用 `?`，不用 `| undefined`
- 避免 `as any` 和未检查的类型转换；优先使用类型收窄和守卫

### 命名规范

| 类型               | 规范                | 示例                          |
|-------------------|---------------------|------------------------------|
| 文件              | `kebab-case.ts`     | `feishu.adapter.ts`          |
| 类                | `PascalCase`        | `FeishuAdapter`              |
| 函数/变量         | `camelCase`         | `sendMessage`, `createHandler`|
| 常量              | `UPPER_SNAKE_CASE`  | `AGENT_LARK`, `UPDATE_INTERVAL`|
| 类型/接口         | `PascalCase`        | `BridgeAdapter`, `FeishuConfig`|
| 私有成员          | `private` 关键字    | `private client: FeishuClient`|

### 格式化

- 保持合理的行长度；为可读性换行长条件和对象字面量
- 优先使用早返回和小辅助函数，避免深度嵌套代码块
- 未配置自动格式化工具；保持编辑与附近代码风格一致

### 错误处理

- 始终使用 `async/await`，不用 `.then()/.catch()` 链
- 将易失操作包装在 `try/catch` 中
- **可恢复失败**: 用 `bridgeLogger.error()` 记录，返回 `null` 或 `false`
- **不可恢复失败**: 抛出异常让调用方处理
- 禁止使用 `console.log/error` — 必须使用 `bridgeLogger`

```typescript
// 可恢复失败示例
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

### 日志规范

使用 `src/logger.ts` 中的 `bridgeLogger`。包含带方括号组件标签的结构化上下文：

```typescript
bridgeLogger.info(`[Feishu] outgoing files chat=${chatId} sent=${count}`);
bridgeLogger.error('[Command] execution failed', error);
```

标签: `[Plugin]`, `[Feishu]`, `[Command]`, `[Delivery]`, `[FileStore]` 等

### 注释

优先使用自文档化代码。只注释解释*原因*，不注释*做什么*：

```typescript
// Feishu 将 {{...}} 视为模板变量，需要转义
return text.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
```

## 架构

### 适配器模式

每个平台实现 `BridgeAdapter`（定义在 `src/types.ts`）。`src/handler/mux.ts` 中的 `AdapterMux` 按 key 将消息路由到对应适配器。

### 全局状态

跨请求状态存储在 `globalState`（`src/utils.ts`）：适配器实例、会话/聊天映射、待处理问题队列。通过 `globalState.__bridge_mux`、`globalState.__bridge_adapter_instances` 等访问。

### 添加新适配器

1. 在 `src/your-platform/` 创建 `*.adapter.ts`, `*.client.ts`, `*.renderer.ts`
2. 在 `index.your-platform.ts` 添加配置解析器
3. 在 `src/constants/index.ts` 添加常量
4. 在 `index.ts` 的 `adaptersToStart` 数组中注册

### 添加斜杠命令

在 `src/handler/command.ts` 添加新的 `if (normalizedCommand === 'yourcommand')` 分支。

## 运行插件

在 `opencode.json` 中引用插件后启动 OpenCode：
```json
{ "plugin": ["/absolute/path/to/opencode-feishu"] }
```
```bash
opencode web   # 或: opencode tui
```

## 需优先阅读的文件

1. `src/types.ts` - 所有核心接口
2. `index.ts` - 插件启动与适配器注册
3. `src/handler/incoming.flow.ts` - 平台到 OpenCode 的消息流
4. `src/handler/event.flow.ts` - OpenCode 到平台的事件流
5. `src/feishu/feishu.adapter.ts` - 参考适配器实现
