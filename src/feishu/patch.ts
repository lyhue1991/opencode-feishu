import axios from 'axios';

export interface FeishuResourceResponse {
  buffer: Buffer;
  headers: Record<string, unknown>;
  mime?: string;
}

type FeishuHttpError = Error & {
  response?: {
    status: number;
    data: string;
  };
};

// 原生sdk总是超时，直接使用url调用
export async function fetchFeishuResourceToBuffer(params: {
  messageId: string;
  fileKey: string;
  msgType: string;
  maxBytes: number;
  tenantToken: string;
  timeoutMs?: number;
}): Promise<FeishuResourceResponse> {
  const { messageId, fileKey, msgType, maxBytes, tenantToken, timeoutMs = 120000 } = params;
  const url = new URL(
    `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=${encodeURIComponent(
      msgType,
    )}`,
  );

  const res = await axios.get(url.toString(), {
    responseType: 'arraybuffer',
    timeout: timeoutMs,
    headers: {
      Authorization: `Bearer ${tenantToken}`,
    },
    validateStatus: () => true,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const headers = res.headers || {};
  const status = res.status || 0;
  if (status < 200 || status >= 300) {
    const body =
      res.data && Buffer.isBuffer(res.data)
        ? res.data.toString('utf8')
        : JSON.stringify(res.data || '');
    const err: FeishuHttpError = new Error(`HTTP ${status}: ${body}`);
    err.response = { status, data: body };
    throw err;
  }

  const contentLengthRaw = headers['content-length'];
  const contentLength = contentLengthRaw ? Number(contentLengthRaw) : 0;
  if (contentLength && contentLength > maxBytes) {
    throw new Error('Content too large');
  }

  const buffer: Buffer = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data || '');
  if (buffer.length > maxBytes) {
    throw new Error('Content too large');
  }

  const contentType = headers['content-type'];
  const contentTypeText = Array.isArray(contentType) ? contentType[0] : contentType;
  const mime =
    typeof contentTypeText === 'string' ? contentTypeText.split(';')[0]?.trim() : undefined;

  return { buffer, headers, mime };
}
