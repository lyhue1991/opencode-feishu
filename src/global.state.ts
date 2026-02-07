import type { AdapterMux } from './handler/mux';
import type { BridgeAdapter } from './types';

export type BridgeSendErrorFn = (chatId: string, content: string) => Promise<void>;

type BridgeRuntimeState = {
  __bridge_mux?: AdapterMux;
  __bridge_feishu_adapter?: BridgeAdapter;
  __bridge_listener_started?: boolean;
  __bridge_send_error_message?: BridgeSendErrorFn;
  __bridge_progress_msg_ids?: Map<string, string>;
  __bridge_max_file_size?: Map<string, number>;
  __bridge_max_file_retry?: Map<string, number>;
};

type FeishuRuntimeState = {
  __feishu_processed_ids?: Set<string>;
  __feishu_ws_client_instance?: unknown;
};

export type BridgeGlobalState = typeof globalThis & BridgeRuntimeState & FeishuRuntimeState;
