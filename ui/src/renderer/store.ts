/**
 * UI 状态 = 内核状态的投影（M0 定下的纪律：UI 不自持业务状态）。
 * 这里是唯一的 reducer：KernelEvent / QueryResponse → 不可变快照。
 */
import type {
  KernelEvent,
  Message,
  QueryResponse,
  RegistrySnapshot,
  SessionMeta,
  TextContent,
} from '@pi-harness/protocol/contract';

export interface UiState {
  kernelStatus: 'starting' | 'ready' | 'busy' | 'error';
  sessions: SessionMeta[];
  currentSessionId: string | null;
  messages: Message[];
  /** 流式中的 assistant 文本缓冲 */
  streamingText: string;
  pendingApprovals: Map<string, { toolName: string; reason: string; detail: string }>;
  registry: RegistrySnapshot | null;
  /** 底部面板事件日志（命令回执 / 状态变化），最新在底部 */
  log: string[];
}

export const initialState: UiState = {
  kernelStatus: 'starting',
  sessions: [],
  currentSessionId: null,
  messages: [],
  streamingText: '',
  pendingApprovals: new Map(),
  registry: null,
  log: [],
};

export function reduceEvent(state: UiState, event: KernelEvent): UiState {
  switch (event.type) {
    case 'kernel_status':
      return {
        ...state,
        kernelStatus: event.status,
        log: [...state.log.slice(-50), `[status] ${event.status}`],
      };
    case 'command_executed': {
      const line = `[command] ${event.commandId}${event.detail ? ` — ${event.detail}` : ''}${event.ok ? '' : '（失败）'}`;
      return { ...state, log: [...state.log.slice(-50), line] };
    }
    case 'session_started':
      return {
        ...state,
        sessions: [...state.sessions, event.meta],
        currentSessionId: event.sessionId,
        messages: [],
        streamingText: '',
      };
    case 'message_start':
      return event.role === 'assistant' ? { ...state, streamingText: '' } : state;
    case 'text_delta':
      return { ...state, streamingText: state.streamingText + event.delta };
    case 'message_end': {
      if (state.streamingText.length === 0) return state;
      const content: TextContent = { type: 'text', text: state.streamingText };
      return {
        ...state,
        messages: [...state.messages, { role: 'assistant', content: [content] }],
        streamingText: '',
      };
    }
    case 'tool_call':
      return {
        ...state,
        messages: [...state.messages, { role: 'assistant', content: [event.call] }],
      };
    case 'tool_result':
      return {
        ...state,
        messages: [...state.messages, { role: 'assistant', content: [event.result] }],
      };
    case 'approval_request': {
      const approvals = new Map(state.pendingApprovals);
      approvals.set(event.requestId, {
        toolName: event.toolName,
        reason: event.reason,
        detail: event.detail,
      });
      return { ...state, pendingApprovals: approvals };
    }
    case 'approval_resolved': {
      const approvals = new Map(state.pendingApprovals);
      approvals.delete(event.requestId);
      return { ...state, pendingApprovals: approvals };
    }
    default:
      return state;
  }
}

/** 查询回包并入状态（list_sessions 是唯一的幂等回放） */
export function reduceQueryResponse(state: UiState, resp: QueryResponse): UiState {
  if (resp.kind === 'list_sessions') {
    return { ...state, sessions: resp.sessions };
  }
  if (resp.kind === 'get_registry') {
    return { ...state, registry: resp.registry };
  }
  return state;
}
