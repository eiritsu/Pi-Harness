/**
 * PiKernelDriver — 驱动 vendored pi 的 Agent loop，对接 protocol v1。
 *
 * 模型：M1 用上游 faux provider（脚本化 mock，确定性）；真实 provider 在
 * host 模型路由就绪后接入（同一 StreamFn 注入点，driver 结构不变）。
 *
 * 审批门：beforeToolCall 内 emit approval_request 并 await 用户决策——
 * 挂起期间 agent loop 自然暂停，无需额外状态机。
 */
import { Agent } from '@earendil-works/pi-agent-core';
import type {
  AgentEvent,
  AgentInitialState,
  AgentTool,
} from '@earendil-works/pi-agent-core';
import { Type, type Static, type TSchema } from '@earendil-works/pi-ai';
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  registerFauxProvider,
  streamSimple,
} from '@earendil-works/pi-ai/compat';
import {
  ApprovalDecision,
  KernelCommand,
  KernelEvent,
  PermissionMode,
  Query,
  QueryResponse,
  SessionMeta,
} from '@pi-harness/protocol';
import { isPermissionMode } from '@pi-harness/protocol';
import type { KernelDriver } from './driver.js';
import { judge, type ToolRisk } from './sandbox.js';
import { loadRegistrySnapshot } from './registry-loader.js';

export type FauxRegistration = ReturnType<typeof registerFauxProvider>;

interface SessionRuntime {
  meta: SessionMeta;
  agent: Agent;
  permissionMode: PermissionMode;
  /** requestId → resolve（审批挂起中） */
  pendingApprovals: Map<string, (d: ApprovalDecision) => void>;
  autoApprovalSeq: number;
  /** 当前 run 的完成信号（waitForIdle 用） */
  runPromise: Promise<void> | null;
}

export interface PiKernelDriverOptions {
  /** 覆盖默认 faux 模型脚本（测试注入点） */
  buildResponses?: (registration: FauxRegistration) => void;
  workspaceRoot?: string;
  /** 插件注册表文件；每次 get_registry 重读（M3 验收机制） */
  pluginRegistryPaths?: string[];
}

function nextRequestId(session: SessionRuntime): string {
  session.autoApprovalSeq += 1;
  return `req-${session.autoApprovalSeq}`;
}

const WriteFileParams = Type.Object({
  path: Type.String({ description: '目标文件路径' }),
  content: Type.String({ description: '文件内容' }),
});

/** 最小内置工具集：够验证审批门与工具事件配对；完整工具集在 host 层装配 */
const WriteFileTool: AgentTool<typeof WriteFileParams> = {
  name: 'fs.write',
  description: '写入文件到磁盘',
  label: '写入文件',
  parameters: WriteFileParams,
  async execute(_toolCallId, args) {
    return {
      content: [{ type: 'text', text: `wrote ${args.path}` }],
      details: { bytes: args.content.length },
    };
  },
};

export class PiKernelDriver implements KernelDriver {
  private sessions = new Map<string, SessionRuntime>();
  private listeners = new Set<(e: KernelEvent) => void>();
  private faux: FauxRegistration;
  private seq = 0;
  private workspaceRoot: string;
  private pluginRegistryPaths: string[];

  constructor(opts: PiKernelDriverOptions = {}) {
    this.workspaceRoot = opts.workspaceRoot ?? '/tmp/pi-harness-workspace';
    this.pluginRegistryPaths = opts.pluginRegistryPaths ?? [];
    this.faux = registerFauxProvider({
      models: [
        {
          id: 'faux-1',
          name: 'Faux 1',
          reasoning: false,
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128_000,
          maxTokens: 4_096,
        },
      ],
      tokensPerSecond: 1_000_000, // 测试用全速吐字
    });
    if (opts.buildResponses) opts.buildResponses(this.faux);
  }

  onEvent(listener: (event: KernelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: KernelEvent): void {
    for (const l of [...this.listeners]) l(event);
  }

  // ------------------------------------------------------------------
  // 会话
  // ------------------------------------------------------------------

  private createSession(projectId: string | null): SessionRuntime {
    this.seq += 1;
    const id = `session-${this.seq}`;
    const model = this.faux.models[0]!;
    const meta: SessionMeta = {
      id,
      title: projectId ? `会话 ${id}` : '新对话',
      projectId,
      createdAt: new Date().toISOString(),
      pinned: false,
      archived: false,
    };

    const initial: AgentInitialState = {
      systemPrompt: 'You are a coding agent inside Pi Harness.',
      model,
      thinkingLevel: 'off',
      tools: [WriteFileTool],
    };

    const runtime: SessionRuntime = {
      meta,
      agent: new Agent({
        streamFn: streamSimple,
        initialState: initial,
        beforeToolCall: (ctx) => this.gateToolCall(runtime, ctx),
      }),
      permissionMode: 'sandbox_workspace_write',
      pendingApprovals: new Map(),
      autoApprovalSeq: 0,
      runPromise: null,
    };

    runtime.agent.subscribe((event: AgentEvent) => this.mapAgentEvent(id, event));
    this.sessions.set(id, runtime);
    return runtime;
  }

  /** beforeToolCall 审批门：挂起 → 等待 resolve → 放行或拦截 */
  private async gateToolCall(
    session: SessionRuntime,
    ctx: { toolCall: { id: string; name: string }; args: unknown },
  ): Promise<{ block?: boolean; reason?: string } | undefined> {
    const toolName = ctx.toolCall.name;
    const risk = this.riskOf(toolName, ctx.args);
    const req: Parameters<typeof judge>[0] = { toolName, risk };
    const path = this.pathOf(toolName, ctx.args);
    if (path !== undefined) req.path = path;
    if (this.workspaceRoot !== undefined) req.workspaceRoot = this.workspaceRoot;
    const verdict = judge(req, session.permissionMode);
    if (verdict === 'allow') return undefined; // 直接放行
    if (verdict === 'deny') {
      return { block: true, reason: `权限档 ${session.permissionMode} 禁止 ${risk} 操作` };
    }

    // approval：挂起等待用户决策
    const requestId = nextRequestId(session);
    this.emit({
      type: 'approval_request',
      sessionId: session.meta.id,
      requestId,
      toolName,
      reason: `${risk === 'write' ? '工作区外写入' : '命令执行'}需要审批`,
      detail: JSON.stringify(ctx.args).slice(0, 500),
    });
    const decision = await new Promise<ApprovalDecision>((resolve) => {
      session.pendingApprovals.set(requestId, resolve);
    });
    if (decision === 'deny') {
      return { block: true, reason: '用户拒绝' };
    }
    if (decision === 'approve-always') {
      session.permissionMode = 'full-access';
    }
    return undefined; // 放行
  }

  private riskOf(toolName: string, _args: unknown): ToolRisk {
    if (toolName === 'fs.read') return 'read';
    if (toolName === 'fs.write') return 'write';
    return 'execute';
  }

  private pathOf(toolName: string, args: unknown): string | undefined {
    if (toolName !== 'fs.write') return undefined;
    const a = args as { path?: string } | null;
    return typeof a?.path === 'string' ? a.path : undefined;
  }

  // ------------------------------------------------------------------
  // AgentEvent → KernelEvent 映射
  // ------------------------------------------------------------------

  private mapAgentEvent(sessionId: string, event: AgentEvent): void {
    switch (event.type) {
      case 'agent_start':
        this.emit({ type: 'kernel_status', status: 'busy' });
        return;
      case 'agent_end':
        this.emit({ type: 'kernel_status', status: 'ready' });
        return;
      case 'message_start': {
        if (event.message.role === 'assistant') {
          this.emit({ type: 'message_start', sessionId, role: 'assistant' });
        }
        return;
      }
      case 'message_update': {
        const ae = event.assistantMessageEvent;
        if (ae.type === 'text_delta') {
          this.emit({ type: 'text_delta', sessionId, delta: ae.delta });
        }
        return;
      }
      case 'message_end': {
        if (event.message.role === 'assistant') {
          this.emit({ type: 'message_end', sessionId });
        }
        return;
      }
      case 'tool_execution_start': {
        this.emit({
          type: 'tool_call',
          sessionId,
          call: { type: 'tool_call', callId: event.toolCallId, name: event.toolName, args: event.args },
        });
        return;
      }
      case 'tool_execution_end': {
        this.emit({
          type: 'tool_result',
          sessionId,
          result: {
            type: 'tool_result',
            callId: event.toolCallId,
            ok: !event.isError,
            output: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
            durationMs: 0,
          },
        });
        return;
      }
      default:
        return; // turn_start/turn_end/message_update 非文本增量暂不映射
    }
  }

  // ------------------------------------------------------------------
  // KernelDriver 接口
  // ------------------------------------------------------------------

  handleCommand(command: KernelCommand): void {
    switch (command.type) {
      case 'create_session': {
        const rt = this.createSession(command.projectId);
        this.emit({ type: 'session_started', sessionId: rt.meta.id, meta: rt.meta });
        this.emit({ type: 'kernel_status', status: 'ready' });
        return;
      }
      case 'send_user_message': {
        const rt = this.sessions.get(command.sessionId);
        if (!rt) return;
        rt.runPromise = rt.agent.prompt(command.text).then(() => {
          rt.runPromise = null;
        });
        return;
      }
      case 'resolve_approval': {
        const rt = this.sessions.get(command.sessionId);
        if (!rt) return;
        const resolve = rt.pendingApprovals.get(command.requestId);
        if (!resolve) return;
        rt.pendingApprovals.delete(command.requestId);
        this.emit({
          type: 'approval_resolved',
          sessionId: command.sessionId,
          requestId: command.requestId,
          decision: command.decision,
        });
        resolve(command.decision);
        return;
      }
      case 'set_permission_mode': {
        const rt = this.sessions.get(command.sessionId);
        if (rt && isPermissionMode(command.mode)) rt.permissionMode = command.mode;
        return;
      }
      case 'interrupt': {
        const rt = this.sessions.get(command.sessionId);
        rt?.agent.abort();
        return;
      }
      case 'run_command': {
        if (command.commandId === 'session.new') {
          this.handleCommand({ type: 'create_session', projectId: null });
          this.emit({ type: 'command_executed', commandId: command.commandId, ok: true, detail: '新对话已创建' });
          return;
        }
        if (command.commandId.startsWith('permission.')) {
          const mode = command.commandId.slice('permission.'.length);
          const target = command.sessionId ?? [...this.sessions.keys()][0];
          if (
            target &&
            (mode === 'read-only' || mode === 'sandbox_workspace_write' || mode === 'full-access' || mode === 'auto')
          ) {
            this.handleCommand({ type: 'set_permission_mode', sessionId: target, mode });
            this.emit({ type: 'command_executed', commandId: command.commandId, ok: true, detail: `权限档 → ${mode}` });
            return;
          }
        }
        this.emit({ type: 'command_executed', commandId: command.commandId, ok: true });
        return;
      }
      case 'stop_session': {
        const rt = this.sessions.get(command.sessionId);
        if (rt) {
          rt.agent.abort();
          this.sessions.delete(command.sessionId);
        }
        return;
      }
    }
  }

  handleQuery(query: Query): Promise<QueryResponse> {
    switch (query.kind) {
      case 'list_sessions': {
        const sessions = [...this.sessions.values()]
          .map((rt) => rt.meta)
          .filter((m) => query.includeArchived || !m.archived);
        return Promise.resolve({ kind: 'list_sessions', sessions });
      }
      case 'get_session': {
        const rt = this.sessions.get(query.sessionId);
        if (!rt) {
          return Promise.resolve({ kind: 'get_session_error', reason: 'session not found' });
        }
        return Promise.resolve({ kind: 'get_session', meta: rt.meta, messages: [] });
      }
      case 'get_registry': {
        const { snapshot } = loadRegistrySnapshot(
          {
            commands: [
              { id: 'session.new', title: '新对话', group: 'action', source: 'builtin' },
              { id: 'permission.read-only', title: '权限：只读', group: 'action', source: 'builtin' },
              { id: 'permission.sandbox_workspace_write', title: '权限：工作区写入', group: 'action', source: 'builtin' },
              { id: 'permission.full-access', title: '权限：完全访问', group: 'action', source: 'builtin' },
              { id: 'permission.auto', title: '权限：自动', group: 'action', source: 'builtin' },
            ],
            tools: [
              { name: 'fs.read', description: '读取文件', source: 'builtin' },
              { name: 'fs.write', description: '写入文件', source: 'builtin' },
            ],
            presets: [
              { id: 'default', title: '默认预设', permissionMode: 'sandbox_workspace_write', source: 'builtin' },
            ],
          },
          this.pluginRegistryPaths,
        );
        return Promise.resolve({ kind: 'get_registry', registry: snapshot });
      }
    }
  }

  /** 等待会话当前 run 结束（driver 专属测试/编排钩子，不属于 KernelDriver 契约） */
  async waitForIdle(sessionId: string): Promise<void> {
    const rt = this.sessions.get(sessionId);
    if (rt?.runPromise) await rt.runPromise;
  }

  dispose(): void {
    for (const rt of this.sessions.values()) rt.agent.abort();
    this.sessions.clear();
    this.listeners.clear();
    this.faux.unregister();
  }
}

export { fauxAssistantMessage, fauxText, fauxToolCall };
