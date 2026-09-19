/**
 * Fake UI — 契约参考实现（kernel 侧开发不需要真前端）。
 *
 * 一个"最笨但正确"的渲染器：收到事件就更新投影状态，
 * 不做任何 UI 层的业务判断——这正是真 UI 要遵守的纪律。
 */
import type {
  Envelope,
  KernelCommand,
  Message,
  MessageContent,
  PermissionMode,
  Query,
  QueryResponse,
  RegistrySnapshot,
  SessionMeta,
  TextContent,
  ToolCallContent,
  ToolResultContent,
} from './index.js';

/** UI 的全部状态 = 内核状态的投影 */
export interface UiProjection {
  sessions: SessionMeta[];
  currentSessionId: string | null;
  /** sessionId → 流式中的文本缓冲 */
  streamingText: Map<string, string>;
  messages: Message[];
  pendingApprovals: Map<string, { toolName: string; reason: string; detail: string }>;
  registry: RegistrySnapshot | null;
  permissionMode: PermissionMode;
  kernelStatus: string;
}

export class FakeUi {
  readonly projection: UiProjection = {
    sessions: [],
    currentSessionId: null,
    streamingText: new Map(),
    messages: [],
    pendingApprovals: new Map(),
    registry: null,
    permissionMode: 'sandbox_workspace_write',
    kernelStatus: 'starting',
  };

  /** 发出的全部命令/查询（测试断言用） */
  readonly sent: Envelope[] = [];
  private queryId = 0;
  private queryWaiters = new Map<
    number,
    (r: QueryResponse) => void
  >();

  constructor(
    private send: (e: Envelope) => void,
  ) {}

  /** kernel → ui 事件入口 */
  handleEnvelope(e: Envelope): void {
    if (e.channel === 'query_response') {
      const w = this.queryWaiters.get(e.id);
      if (w) {
        this.queryWaiters.delete(e.id);
        w(e.payload);
      }
      return;
    }
    if (e.channel !== 'event') return;
    const p = e.payload;
    switch (p.type) {
      case 'session_started': {
        this.projection.sessions.push(p.meta);
        this.projection.currentSessionId = p.sessionId;
        break;
      }
      case 'message_start':
        break;
      case 'text_delta': {
        const buf = this.projection.streamingText.get(p.sessionId) ?? '';
        this.projection.streamingText.set(p.sessionId, buf + p.delta);
        break;
      }
      case 'message_end': {
        const text = this.projection.streamingText.get(p.sessionId);
        if (text !== undefined && text.length > 0) {
          const content: TextContent = { type: 'text', text };
          this.projection.messages.push({ role: 'assistant', content: [content] });
          this.projection.streamingText.delete(p.sessionId);
        }
        break;
      }
      case 'tool_call': {
        const c: ToolCallContent = p.call;
        this.projection.messages.push({ role: 'assistant', content: [c] });
        break;
      }
      case 'tool_result': {
        const r: ToolResultContent = p.result;
        this.projection.messages.push({ role: 'assistant', content: [r] });
        break;
      }
      case 'approval_request': {
        this.projection.pendingApprovals.set(p.requestId, {
          toolName: p.toolName,
          reason: p.reason,
          detail: p.detail,
        });
        break;
      }
      case 'approval_resolved': {
        this.projection.pendingApprovals.delete(p.requestId);
        break;
      }
      case 'kernel_status':
        this.projection.kernelStatus = p.status;
        break;
    }
  }

  // ---- ui → kernel 出口 ----

  createSession(projectId: string | null): void {
    const cmd: KernelCommand = { type: 'create_session', projectId };
    const e: Envelope = { channel: 'command', payload: cmd };
    this.sent.push(e);
    this.send(e);
  }

  sendUserMessage(sessionId: string, text: string): void {
    const cmd: KernelCommand = { type: 'send_user_message', sessionId, text };
    const e: Envelope = { channel: 'command', payload: cmd };
    this.sent.push(e);
    this.send(e);
  }

  resolveApproval(sessionId: string, requestId: string, decision: 'deny' | 'approve' | 'approve-always'): void {
    const cmd: KernelCommand = {
      type: 'resolve_approval',
      sessionId,
      requestId,
      decision,
    };
    const e: Envelope = { channel: 'command', payload: cmd };
    this.sent.push(e);
    this.send(e);
  }

  setPermissionMode(sessionId: string, mode: PermissionMode): void {
    const cmd: KernelCommand = { type: 'set_permission_mode', sessionId, mode };
    const e: Envelope = { channel: 'command', payload: cmd };
    this.sent.push(e);
    this.send(e);
    this.projection.permissionMode = mode;
  }

  query(payload: Query): Promise<QueryResponse> {
    this.queryId += 1;
    const id = this.queryId;
    const e: Envelope = { channel: 'query', id, payload };
    this.sent.push(e);
    return new Promise((resolve) => {
      this.queryWaiters.set(id, resolve);
      this.send(e);
    });
  }

  /** 供测试：直接读取消息内容里的文本拼接 */
  messageText(role: 'assistant' | 'user'): string {
    return this.projection.messages
      .filter((m) => m.role === role)
      .flatMap((m: Message) => m.content)
      .filter((c: MessageContent): c is TextContent => c.type === 'text')
      .map((c) => c.text)
      .join('');
  }
}
