export const globalState = globalThis as any;
export const processedMessageIds = globalState.__feishu_processed_ids || new Set<string>();
globalState.__feishu_processed_ids = processedMessageIds;
