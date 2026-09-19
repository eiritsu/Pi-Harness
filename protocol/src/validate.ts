/**
 * 运行时校验器 — 不引入 zod 等依赖，手写类型守卫。
 * 契约 v1 的所有跨进程输入都必须过这里，坏数据在边界被拒绝。
 */
import type {
  ApprovalDecision,
  Envelope,
  KernelCommand,
  KernelEvent,
  MessageContent,
  PermissionMode,
  Query,
  QueryResponse,
} from './index.js';
import { PERMISSION_MODES, PROTOCOL_VERSION } from './index.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isPermissionMode(v: unknown): v is PermissionMode {
  return typeof v === 'string' && (PERMISSION_MODES as readonly string[]).includes(v);
}

export function isApprovalDecision(v: unknown): v is ApprovalDecision {
  return (
    v === 'deny' || v === 'approve' || v === 'approve-always'
  );
}

export function isMessageContent(v: unknown): v is MessageContent {
  if (!isRecord(v)) return false;
  switch (v['type']) {
    case 'text':
      return typeof v['text'] === 'string';
    case 'tool_call':
      return (
        typeof v['callId'] === 'string' &&
        typeof v['name'] === 'string'
        // args: 任意 JSON 值，外层已保证 lossless JSON
      );
    case 'tool_result':
      return (
        typeof v['callId'] === 'string' &&
        typeof v['ok'] === 'boolean' &&
        typeof v['output'] === 'string' &&
        typeof v['durationMs'] === 'number' &&
        Number.isFinite(v['durationMs'])
      );
    default:
      return false;
  }
}

function isSessionMeta(v: unknown): boolean {
  return (
    isRecord(v) &&
    typeof v['id'] === 'string' &&
    typeof v['title'] === 'string' &&
    (v['projectId'] === null || typeof v['projectId'] === 'string') &&
    typeof v['createdAt'] === 'string' &&
    typeof v['pinned'] === 'boolean' &&
    typeof v['archived'] === 'boolean'
  );
}

export function isKernelEvent(v: unknown): v is KernelEvent {
  if (!isRecord(v)) return false;
  switch (v['type']) {
    case 'session_started':
      return isSessionMeta(v['meta']);
    case 'message_start':
    case 'message_end':
      return typeof v['sessionId'] === 'string';
    case 'text_delta':
      return typeof v['sessionId'] === 'string' && typeof v['delta'] === 'string';
    case 'tool_call':
      return (
        typeof v['sessionId'] === 'string' && isMessageContent(v['call'])
      );
    case 'tool_result':
      return (
        typeof v['sessionId'] === 'string' && isMessageContent(v['result'])
      );
    case 'approval_request':
      return (
        typeof v['sessionId'] === 'string' &&
        typeof v['requestId'] === 'string' &&
        typeof v['toolName'] === 'string' &&
        typeof v['reason'] === 'string' &&
        typeof v['detail'] === 'string'
      );
    case 'approval_resolved':
      return (
        typeof v['sessionId'] === 'string' &&
        typeof v['requestId'] === 'string' &&
        isApprovalDecision(v['decision'])
      );
    case 'kernel_status':
      return (
        v['status'] === 'starting' ||
        v['status'] === 'ready' ||
        v['status'] === 'busy' ||
        v['status'] === 'error'
      );
    case 'command_executed':
      return (
        typeof v['commandId'] === 'string' &&
        typeof v['ok'] === 'boolean' &&
        (v['detail'] === undefined || typeof v['detail'] === 'string')
      );
    case 'permission_changed':
      return (
        typeof v['sessionId'] === 'string' && isPermissionMode(v['mode'])
      );
    default:
      return false;
  }
}

export function isKernelCommand(v: unknown): v is KernelCommand {
  if (!isRecord(v)) return false;
  switch (v['type']) {
    case 'create_session':
      return v['projectId'] === null || typeof v['projectId'] === 'string';
    case 'send_user_message':
      return (
        typeof v['sessionId'] === 'string' && typeof v['text'] === 'string'
      );
    case 'interrupt':
    case 'stop_session':
      return typeof v['sessionId'] === 'string';
    case 'resolve_approval':
      return (
        typeof v['sessionId'] === 'string' &&
        typeof v['requestId'] === 'string' &&
        isApprovalDecision(v['decision'])
      );
    case 'set_permission_mode':
      return (
        typeof v['sessionId'] === 'string' && isPermissionMode(v['mode'])
      );
    case 'run_command':
      return (
        typeof v['commandId'] === 'string' &&
        (v['sessionId'] === undefined || typeof v['sessionId'] === 'string')
      );
    default:
      return false;
  }
}

export function isQuery(v: unknown): v is Query {
  if (!isRecord(v)) return false;
  switch (v['kind']) {
    case 'list_sessions':
      return (
        v['includeArchived'] === undefined ||
        typeof v['includeArchived'] === 'boolean'
      );
    case 'get_session':
      return typeof v['sessionId'] === 'string';
    case 'get_registry':
      return true;
    default:
      return false;
  }
}

export function isQueryResponse(v: unknown): v is QueryResponse {
  if (!isRecord(v)) return false;
  switch (v['kind']) {
    case 'list_sessions':
      return (
        Array.isArray(v['sessions']) && v['sessions'].every(isSessionMeta)
      );
    case 'get_session':
      return isSessionMeta(v['meta']) && Array.isArray(v['messages']);
    case 'get_session_error':
      return typeof v['reason'] === 'string';
    case 'get_registry':
      return isRecord(v['registry']);
    default:
      return false;
  }
}

export function isEnvelope(v: unknown): v is Envelope {
  if (!isRecord(v)) return false;
  switch (v['channel']) {
    case 'event':
      return isKernelEvent(v['payload']);
    case 'command':
      return isKernelCommand(v['payload']);
    case 'query':
      return typeof v['id'] === 'number' && isQuery(v['payload']);
    case 'query_response':
      return typeof v['id'] === 'number' && isQueryResponse(v['payload']);
    default:
      return false;
  }
}

export { PROTOCOL_VERSION };
