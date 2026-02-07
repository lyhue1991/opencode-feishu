import { buildDisplayContent } from '../bridge/buffer';
import type { BufferStatus, MessageBuffer } from '../bridge/buffer';

export const FLOW_LOG_PREFIX = '[BridgeFlow]';
const EXECUTION_TO_ANSWER_SPLIT_MIN_TEXT = 120;
type ExecutionMessageBuffer = MessageBuffer & { __executionCarried?: boolean };

function hasSubstantiveAnswerText(buf: ExecutionMessageBuffer): boolean {
  return (buf?.text || '').trim().length > 1;
}

function isToolCallPhase(buf: ExecutionMessageBuffer): boolean {
  const note = String(buf?.statusNote || '').toLowerCase();
  return note.includes('tool-calls') || note.includes('tool calls');
}

export function shouldCarryPlatformMessageAcrossAssistantMessages(
  prevBuf: ExecutionMessageBuffer | undefined,
): boolean {
  if (!prevBuf?.platformMsgId) return false;
  if (prevBuf?.status === 'error' || prevBuf?.status === 'aborted') return false;
  if (isToolCallPhase(prevBuf)) return true;
  return (
    !hasSubstantiveAnswerText(prevBuf) &&
    (!!(prevBuf?.tools?.size || 0) || !!(prevBuf?.reasoning || '').trim())
  );
}

export function carryPlatformMessage(prevBuf: ExecutionMessageBuffer, nextBuf: ExecutionMessageBuffer) {
  nextBuf.platformMsgId = prevBuf.platformMsgId;
  nextBuf.lastDisplayHash = '';
  nextBuf.__executionCarried = true;
  if ((nextBuf.tools?.size || 0) === 0 && (prevBuf.tools?.size || 0) > 0) {
    nextBuf.tools = new Map(prevBuf.tools);
  }
  if (!nextBuf.files?.length && Array.isArray(prevBuf.files) && prevBuf.files.length > 0) {
    nextBuf.files = [...prevBuf.files];
  }
  prevBuf.platformMsgId = null;
}

export function shouldSplitOutFinalAnswer(buffer: ExecutionMessageBuffer): boolean {
  if (!buffer?.platformMsgId || !buffer?.__executionCarried) return false;
  if (isToolCallPhase(buffer)) return false;
  const textLen = (buffer?.text || '').trim().length;
  return textLen >= EXECUTION_TO_ANSWER_SPLIT_MIN_TEXT;
}

export function splitFinalAnswerFromExecution(buffer: ExecutionMessageBuffer) {
  buffer.platformMsgId = null;
  buffer.lastDisplayHash = '';
  buffer.__executionCarried = false;
  // Final answer should be a clean message, not mixed with historical tool steps.
  buffer.tools = new Map();
}

export function buildFinalizedExecutionContent(buffer: ExecutionMessageBuffer): string {
  const finalExecutionView = {
    ...buffer,
    text: '',
    status: 'done' as BufferStatus,
    statusNote: String(buffer.statusNote || 'tool-calls'),
  };
  return buildDisplayContent(finalExecutionView);
}

export function buildPlatformDisplay(buffer: ExecutionMessageBuffer): string {
  // Avoid leaking partial conclusion into execution cards.
  if (
    buffer?.__executionCarried &&
    (buffer?.tools?.size || 0) > 0 &&
    hasSubstantiveAnswerText(buffer)
  ) {
    return buildDisplayContent({ ...buffer, text: '' });
  }
  return buildDisplayContent(buffer);
}
