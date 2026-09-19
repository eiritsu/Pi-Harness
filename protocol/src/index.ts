/**
 * protocol/v1 — Pi Harness RPC 契约（单一事实源）
 *
 * 冻结规则：
 * - v1 内只能追加可选字段；破坏性变更必须升版本号（v2 并存）。
 * - 所有跨进程消息必须是可 JSON 序列化的纯数据（lossless JSON only）。
 * - kernel 与 ui 互不 import 对方，只 import 本包。
 */

// ---------------------------------------------------------------------------
// 权限枚举（对齐 Codex 实物拆解：三档 + auto）
// ---------------------------------------------------------------------------

export type PermissionMode =
  | 'read-only'
  | 'sandbox_workspace_write'
  | 'full-access'
  | 'auto';

export const PERMISSION_MODES: readonly PermissionMode[] = [
  'read-only',
  'sandbox_workspace_write',
  'full-access',
  'auto',
] as const;

/** 审批决策 */
export type ApprovalDecision = 'deny' | 'approve' | 'approve-always';

// ---------------------------------------------------------------------------
// 会话与消息
// ---------------------------------------------------------------------------

export type SessionId = string;

export interface SessionMeta {
  id: SessionId;
  title: string;
  projectId: string | null;
  createdAt: string; // ISO 8601
  pinned: boolean;
  archived: boolean;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolCallContent {
  type: 'tool_call';
  callId: string;
  name: string;
  args: unknown; // 必须可 JSON 序列化
}

export interface ToolResultContent {
  type: 'tool_result';
  callId: string;
  ok: boolean;
  /** 输出为纯文本（二进制由 kernel 层摘要化） */
  output: string;
  durationMs: number;
}

export type MessageContent = TextContent | ToolCallContent | ToolResultContent;

export interface Message {
  role: MessageRole;
  content: MessageContent[];
}

// ---------------------------------------------------------------------------
// 事件流（kernel → ui 单向）
// ---------------------------------------------------------------------------

export type KernelEvent =
  | { type: 'session_started'; sessionId: SessionId; meta: SessionMeta }
  | { type: 'message_start'; sessionId: SessionId; role: MessageRole }
  | {
      type: 'text_delta';
      sessionId: SessionId;
      /** 增量文本，按序拼接即全文 */
      delta: string;
    }
  | { type: 'message_end'; sessionId: SessionId }
  | { type: 'tool_call'; sessionId: SessionId; call: ToolCallContent }
  | { type: 'tool_result'; sessionId: SessionId; result: ToolResultContent }
  | {
      type: 'approval_request';
      sessionId: SessionId;
      requestId: string;
      toolName: string;
      /** 风险摘要，UI 原样展示（一行） */
      reason: string;
      /** 完整待执行内容（如命令行），等宽展示 */
      detail: string;
    }
  | {
      type: 'approval_resolved';
      sessionId: SessionId;
      requestId: string;
      decision: ApprovalDecision;
    }
  | {
      type: 'kernel_status';
      status: 'starting' | 'ready' | 'busy' | 'error';
      detail?: string;
    }
  /** v1 追加：注册表命令执行回执（插件命令的 UI 反馈） */
  | {
      type: 'command_executed';
      commandId: string;
      ok: boolean;
      detail?: string;
    };

// ---------------------------------------------------------------------------
// 命令（ui → kernel 单向，均无返回值；查询类走 Query）
// ---------------------------------------------------------------------------

export type KernelCommand =
  | { type: 'create_session'; projectId: string | null }
  | { type: 'send_user_message'; sessionId: SessionId; text: string }
  | { type: 'interrupt'; sessionId: SessionId }
  | {
      type: 'resolve_approval';
      sessionId: SessionId;
      requestId: string;
      decision: ApprovalDecision;
    }
  | { type: 'set_permission_mode'; sessionId: SessionId; mode: PermissionMode }
  | { type: 'stop_session'; sessionId: SessionId }
  /**
   * v1 追加：注册表命令执行。内置命令由 kernel 语义化处理
   * （session.new → create_session；permission.* → set_permission_mode），
   * 插件命令回执 command_executed 事件。
   */
  | { type: 'run_command'; commandId: string; sessionId?: SessionId };

// ---------------------------------------------------------------------------
// 查询（ui → kernel 请求/响应；响必须为纯数据）
// ---------------------------------------------------------------------------

export interface ListSessionsQuery {
  kind: 'list_sessions';
  includeArchived?: boolean;
}

export interface GetSessionQuery {
  kind: 'get_session';
  sessionId: SessionId;
}

export interface GetRegistryQuery {
  kind: 'get_registry';
}

export type Query = ListSessionsQuery | GetSessionQuery | GetRegistryQuery;

export type QueryResponse =
  | { kind: 'list_sessions'; sessions: SessionMeta[] }
  | { kind: 'get_session'; meta: SessionMeta; messages: Message[] }
  | { kind: 'get_session_error'; reason: string }
  | { kind: 'get_registry'; registry: RegistrySnapshot };

// ---------------------------------------------------------------------------
// 注册表快照（"壳硬编码，内容查注册表"的数据形态）
// ---------------------------------------------------------------------------

export interface RegistryCommandEntry {
  id: string;
  title: string;
  /** ⌘K 分组：action / navigate / session / settings */
  group: 'action' | 'navigate' | 'session' | 'settings';
  source: 'builtin' | string; // 插件 id
}

export interface RegistryToolEntry {
  name: string;
  description: string;
  source: 'builtin' | string;
}

export interface RegistryPresetEntry {
  id: string;
  title: string;
  permissionMode: PermissionMode;
  source: 'builtin' | string;
}

export interface RegistrySnapshot {
  commands: RegistryCommandEntry[];
  tools: RegistryToolEntry[];
  presets: RegistryPresetEntry[];
}

// ---------------------------------------------------------------------------
// 传输层封包（session 信封，供 IPC/stdio 共用）
// ---------------------------------------------------------------------------

export type Envelope =
  | { channel: 'event'; payload: KernelEvent }
  | { channel: 'command'; payload: KernelCommand }
  | { channel: 'query'; id: number; payload: Query }
  | { channel: 'query_response'; id: number; payload: QueryResponse };

export const PROTOCOL_VERSION = 1 as const;
