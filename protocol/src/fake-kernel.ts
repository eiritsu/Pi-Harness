/**
 * Fake Kernel — 契约参考实现（ui 侧开发不需要真内核）。
 *
 * 诚实性约束：只按脚本吐事件、只回放持久化状态，
 * 不做任何"聪明"的推断——它存在的意义是让契约测试可复现。
 */
import type {
  ApprovalDecision,
  Envelope,
  KernelCommand,
  KernelEvent,
  Message,
  PermissionMode,
  Query,
  QueryResponse,
  RegistrySnapshot,
  SessionMeta,
  TextContent,
  ToolCallContent,
  ToolResultContent,
} from './index.js';
import { PROTOCOL_VERSION } from './index.js';
import { loadRegistrySnapshot } from './registry-loader.js';

export interface ScriptStep {
  /** 用户输入文本（触发一轮） */
  userText: string;
  /** 助手回复的文本增量序列 */
  textDeltas: string[];
  /** 需要审批的工具调用：先发 approval_request */
  approval?: { toolName: string; detail: string; reason: string };
  /** 无需审批的工具调用，直接执行 */
  toolCalls?: Array<{ name: string; args: unknown }>;
  /** 工具结果 */
  toolResults?: Array<{ ok: boolean; output: string }>;
}

export interface FakeKernelOptions {
  registry?: RegistrySnapshot;
  /** 默认权限档；auto = 不再发 approval_request */
  permissionMode?: PermissionMode;
  /** 插件注册表文件；每次 get_registry 重读（M3 验收机制） */
  pluginRegistryPaths?: string[];
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export class FakeKernel {
  private sessions = new Map<string, SessionMeta>();
  private messages = new Map<string, Message[]>();
  private permissionMode: PermissionMode;
  private registry: RegistrySnapshot;
  private pluginRegistryPaths: string[];
  private listeners: Array<(e: Envelope) => void> = [];

  constructor(opts: FakeKernelOptions = {}) {
    this.permissionMode = opts.permissionMode ?? 'sandbox_workspace_write';
    this.pluginRegistryPaths = opts.pluginRegistryPaths ?? [];
    this.registry = opts.registry ?? {
      commands: [
        { id: 'session.new', title: '新对话', group: 'action', source: 'builtin' },
        { id: 'app.settings', title: '打开设置', group: 'settings', source: 'builtin' },
      ],
      tools: [
        { name: 'fs.read', description: '读取文件', source: 'builtin' },
        { name: 'fs.write', description: '写入文件', source: 'builtin' },
      ],
      presets: [
        {
          id: 'default',
          title: '默认预设',
          permissionMode: 'sandbox_workspace_write',
          source: 'builtin',
        },
      ],
    };
  }

  /** ui 侧订阅 kernel 事件 */
  on(listener: (e: Envelope) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private emit(payload: KernelEvent): void {
    const envelope: Envelope = { channel: 'event', payload };
    for (const l of [...this.listeners]) l(envelope);
  }

  private emitQueryResponse(id: number, payload: QueryResponse): void {
    for (const l of [...this.listeners]) {
      l({ channel: 'query_response', id, payload });
    }
  }

  /** 处理 ui → kernel 命令 */
  handleCommand(cmd: KernelCommand): void {
    switch (cmd.type) {
      case 'create_session': {
        const id = nextId('session');
        const meta: SessionMeta = {
          id,
          title: cmd.projectId ? `会话 ${id}` : '新对话',
          projectId: cmd.projectId,
          createdAt: new Date().toISOString(),
          pinned: false,
          archived: false,
        };
        this.sessions.set(id, meta);
        this.messages.set(id, []);
        this.emit({ type: 'session_started', sessionId: id, meta });
        this.emit({ type: 'kernel_status', status: 'ready' });
        return;
      }
      case 'send_user_message': {
        // fake kernel 不跑模型；真实文本回声 + 固定行为由测试脚本驱动
        const msgs = this.messages.get(cmd.sessionId);
        if (!msgs) return;
        msgs.push({
          role: 'user',
          content: [{ type: 'text', text: cmd.text }],
        });
        return;
      }
      case 'resolve_approval': {
        this.emit({
          type: 'approval_resolved',
          sessionId: cmd.sessionId,
          requestId: cmd.requestId,
          decision: cmd.decision,
        });
        return;
      }
      case 'set_permission_mode': {
        this.permissionMode = cmd.mode;
        return;
      }
      case 'interrupt':
      case 'stop_session':
        return;
      case 'run_command': {
        // 内置命令语义化处理；其余回执 command_executed
        if (cmd.commandId === 'session.new') {
          this.handleCommand({ type: 'create_session', projectId: null });
          this.emit({ type: 'command_executed', commandId: cmd.commandId, ok: true, detail: '新对话已创建' });
          return;
        }
        if (cmd.commandId.startsWith('permission.')) {
          const mode = cmd.commandId.slice('permission.'.length);
          const target = cmd.sessionId ?? [...this.sessions.keys()][0];
          if (target && (mode === 'read-only' || mode === 'sandbox_workspace_write' || mode === 'full-access' || mode === 'auto')) {
            this.handleCommand({ type: 'set_permission_mode', sessionId: target, mode });
            this.emit({ type: 'command_executed', commandId: cmd.commandId, ok: true, detail: `权限档 → ${mode}` });
            return;
          }
        }
        this.emit({ type: 'command_executed', commandId: cmd.commandId, ok: true });
        return;
      }
    }
  }

  /** 处理查询 */
  handleQuery(id: number, q: Query): void {
    switch (q.kind) {
      case 'list_sessions': {
        const sessions = [...this.sessions.values()].filter(
          (s) => q.includeArchived || !s.archived,
        );
        this.emitQueryResponse(id, { kind: 'list_sessions', sessions });
        return;
      }
      case 'get_session': {
        const meta = this.sessions.get(q.sessionId);
        const messages = this.messages.get(q.sessionId);
        if (!meta || !messages) {
          this.emitQueryResponse(id, {
            kind: 'get_session_error',
            reason: 'session not found',
          });
          return;
        }
        this.emitQueryResponse(id, {
          kind: 'get_session',
          meta,
          messages,
        });
        return;
      }
      case 'get_registry': {
        const { snapshot } = loadRegistrySnapshot(this.registry, this.pluginRegistryPaths);
        this.emitQueryResponse(id, { kind: 'get_registry', registry: snapshot });
        return;
      }
    }
  }

  /**
   * 驱动一轮脚本化回复：文本流 → （审批）→ 工具 → 文本收尾。
   * 同步推完所有事件（契约测试不关心时序抖动，只关心顺序与配对）。
   */
  runScriptStep(sessionId: string, step: ScriptStep): void {
    this.emit({ type: 'message_start', sessionId, role: 'assistant' });
    for (const delta of step.textDeltas) {
      this.emit({ type: 'text_delta', sessionId, delta });
    }

    // 审批路径：默认档下需要审批；auto / full-access 跳过
    if (step.approval) {
      const needsApproval =
        this.permissionMode === 'sandbox_workspace_write' ||
        this.permissionMode === 'read-only';
      if (needsApproval) {
        const requestId = nextId('req');
        this.emit({
          type: 'approval_request',
          sessionId,
          requestId,
          toolName: step.approval.toolName,
          reason: step.approval.reason,
          detail: step.approval.detail,
        });
        // 审批流暂停在这里；decision 由 handleCommand(resolve_approval) 异步回放
        this.emit({ type: 'message_end', sessionId });
        return;
      }
    }

    if (step.toolCalls && step.toolResults) {
      const calls: ToolCallContent[] = step.toolCalls.map((c) => ({
        type: 'tool_call',
        callId: nextId('call'),
        name: c.name,
        args: c.args,
      }));
      for (const call of calls) {
        this.emit({ type: 'tool_call', sessionId, call });
      }
      step.toolResults.forEach((r, i) => {
        const call = calls[i];
        if (!call) return;
        const result: ToolResultContent = {
          type: 'tool_result',
          callId: call.callId,
          ok: r.ok,
          output: r.output,
          durationMs: 1,
        };
        this.emit({ type: 'tool_result', sessionId, result });
      });
    }

    // 收尾文本并入同一 assistant 消息
    const tail: TextContent = { type: 'text', text: 'done' };
    this.emit({ type: 'text_delta', sessionId, delta: tail.text });
    this.emit({ type: 'message_end', sessionId });
  }

  /** 权限档查询（测试断言用） */
  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  /** 审批决策落地：解除暂停并按 decision 继续脚本 */
  resolveApprovalAndContinue(
    sessionId: string,
    step: ScriptStep,
    decision: ApprovalDecision,
  ): void {
    if (decision === 'approve-always') {
      this.permissionMode = 'full-access';
    }
    if (decision !== 'deny' && step.toolCalls && step.toolResults) {
      const calls: ToolCallContent[] = step.toolCalls.map((c) => ({
        type: 'tool_call',
        callId: nextId('call'),
        name: c.name,
        args: c.args,
      }));
      for (const call of calls) {
        this.emit({ type: 'tool_call', sessionId, call });
      }
      step.toolResults.forEach((r, i) => {
        const call = calls[i];
        if (!call) return;
        const result: ToolResultContent = {
          type: 'tool_result',
          callId: call.callId,
          ok: r.ok,
          output: r.output,
          durationMs: 1,
        };
        this.emit({ type: 'tool_result', sessionId, result });
      });
    }
  }
}

export { PROTOCOL_VERSION };
