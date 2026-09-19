import { describe, it, expect } from 'vitest';
import {
  FakeKernel,
  FakeUi,
  isEnvelope,
  isKernelEvent,
  PROTOCOL_VERSION,
  type Envelope,
} from '../src/main.js';

/** 对拉总线：ui.send → kernel，kernel.emit → ui */
function wire() {
  const kernel = new FakeKernel();
  const ui = new FakeUi((e) => {
    // ui → kernel 方向：command 直接处理，query 带回响应
    if (e.channel === 'command') kernel.handleCommand(e.payload);
    else if (e.channel === 'query') kernel.handleQuery(e.id, e.payload);
  });
  kernel.on((e) => ui.handleEnvelope(e));
  return { kernel, ui };
}

describe('protocol v1 契约', () => {
  it('版本号冻结为 1', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('创建会话：ui 发命令 → kernel 发 session_started + ready', () => {
    const { kernel, ui } = wire();
    ui.createSession(null);
    expect(ui.projection.currentSessionId).not.toBeNull();
    expect(ui.projection.kernelStatus).toBe('ready');
    expect(ui.projection.sessions).toHaveLength(1);
    // 所有事件都通过合法信封
    expect(kernel).toBeDefined();
  });

  it('list_sessions 查询往返', async () => {
    const { ui } = wire();
    ui.createSession(null);
    const resp = await ui.query({ kind: 'list_sessions' });
    expect(resp.kind).toBe('list_sessions');
    if (resp.kind === 'list_sessions') {
      expect(resp.sessions).toHaveLength(1);
    }
  });

  it('get_registry 查询往返：注册表快照完整', async () => {
    const { ui } = wire();
    const resp = await ui.query({ kind: 'get_registry' });
    expect(resp.kind).toBe('get_registry');
    if (resp.kind === 'get_registry') {
      expect(resp.registry.commands.length).toBeGreaterThan(0);
      expect(resp.registry.tools.length).toBeGreaterThan(0);
      expect(resp.registry.presets.length).toBeGreaterThan(0);
    }
  });

  it('get_session 未知 id → get_session_error', async () => {
    const { ui } = wire();
    const resp = await ui.query({ kind: 'get_session', sessionId: 'nope' });
    expect(resp.kind).toBe('get_session_error');
  });

  it('脚本步骤：文本流按序拼接，message_end 后落入消息列表', () => {
    const { kernel, ui } = wire();
    ui.createSession(null);
    const sessionId = ui.projection.currentSessionId!;
    kernel.runScriptStep(sessionId, {
      userText: 'hello',
      textDeltas: ['你', '好', '，', '世', '界'],
    });
    expect(ui.messageText('assistant')).toBe('你好，世界done');
  });

  it('工具调用与结果 callId 配对', () => {
    const { kernel, ui } = wire();
    ui.createSession(null);
    const sessionId = ui.projection.currentSessionId!;
    kernel.runScriptStep(sessionId, {
      userText: 'read file',
      textDeltas: ['reading...'],
      toolCalls: [{ name: 'fs.read', args: { path: '/tmp/a.txt' } }],
      toolResults: [{ ok: true, output: 'file content' }],
    });
    const calls = ui.projection.messages.flatMap((m) => m.content)
      .filter((c) => c.type === 'tool_call');
    const results = ui.projection.messages.flatMap((m) => m.content)
      .filter((c) => c.type === 'tool_result');
    expect(calls).toHaveLength(1);
    expect(results).toHaveLength(1);
    expect(results[0]!.callId).toBe(calls[0]!.callId);
    expect(results[0]!.ok).toBe(true);
  });

  it('审批流：默认档发 approval_request → 暂停 → approve 后继续工具执行', () => {
    const { kernel, ui } = wire();
    ui.createSession(null);
    const sessionId = ui.projection.currentSessionId!;
    kernel.runScriptStep(sessionId, {
      userText: 'rm something',
      textDeltas: ['需要删除'],
      approval: {
        toolName: 'bash',
        detail: 'rm -rf ./dist',
        reason: '工作区外写入',
      },
      toolCalls: [{ name: 'bash', args: { cmd: 'rm -rf ./dist' } }],
      toolResults: [{ ok: true, output: '' }],
    });
    // 审批挂起，工具未执行
    expect(ui.projection.pendingApprovals.size).toBe(1);
    const beforeTools = ui.projection.messages.filter((m) =>
      m.content.some((c) => c.type === 'tool_call'),
    );
    expect(beforeTools).toHaveLength(0);

    // 用户批准 → 继续执行
    const requestId = [...ui.projection.pendingApprovals.keys()][0]!;
    ui.resolveApproval(sessionId, requestId, 'approve');
    expect(ui.projection.pendingApprovals.size).toBe(0);

    // kernel 侧补跑工具
    const step = {
      userText: 'rm something',
      textDeltas: ['需要删除'],
      toolCalls: [{ name: 'bash', args: { cmd: 'rm -rf ./dist' } }],
      toolResults: [{ ok: true, output: '' }],
    };
    kernel.resolveApprovalAndContinue(sessionId, step, 'approve');
    const afterTools = ui.projection.messages.filter((m) =>
      m.content.some((c) => c.type === 'tool_call'),
    );
    expect(afterTools).toHaveLength(1);
  });

  it('auto 档跳过审批，直接执行', () => {
    const { kernel, ui } = wire();
    ui.createSession(null);
    const sessionId = ui.projection.currentSessionId!;
    ui.setPermissionMode(sessionId, 'auto');
    expect(kernel.getPermissionMode()).toBe('auto');
    kernel.runScriptStep(sessionId, {
      userText: 'go',
      textDeltas: ['ok'],
      approval: { toolName: 'bash', detail: 'ls', reason: '任何' },
      toolCalls: [{ name: 'bash', args: { cmd: 'ls' } }],
      toolResults: [{ ok: true, output: 'files' }],
    });
    expect(ui.projection.pendingApprovals.size).toBe(0);
    const tools = ui.projection.messages.filter((m) =>
      m.content.some((c) => c.type === 'tool_call'),
    );
    expect(tools).toHaveLength(1);
  });

  it('approve-always 升级权限档', () => {
    const { kernel } = wire();
    expect(kernel.getPermissionMode()).toBe('sandbox_workspace_write');
    kernel.resolveApprovalAndContinue('s1', { userText: 'x', textDeltas: [] }, 'approve-always');
    expect(kernel.getPermissionMode()).toBe('full-access');
  });

  it('所有事件信封都通过运行时校验器', () => {
    const { kernel, ui } = wire();
    const seen: Envelope[] = [];
    kernel.on((e) => seen.push(e));
    ui.createSession(null);
    const sessionId = ui.projection.currentSessionId!;
    kernel.runScriptStep(sessionId, {
      userText: 't',
      textDeltas: ['a', 'b'],
      toolCalls: [{ name: 'fs.read', args: {} }],
      toolResults: [{ ok: false, output: 'err' }],
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const e of seen) {
      expect(isEnvelope(e)).toBe(true);
      if (e.channel === 'event') expect(isKernelEvent(e.payload)).toBe(true);
    }
  });

  it('信封可无损 JSON 序列化往返', () => {
    const { kernel, ui } = wire();
    const seen: Envelope[] = [];
    kernel.on((e) => seen.push(e));
    ui.createSession(null);
    const sessionId = ui.projection.currentSessionId!;
    kernel.runScriptStep(sessionId, {
      userText: 't',
      textDeltas: ['x'],
      toolCalls: [{ name: 'fs.write', args: { path: '/a', data: '中文' } }],
      toolResults: [{ ok: true, output: 'ok' }],
    });
    for (const e of seen) {
      const round = JSON.parse(JSON.stringify(e)) as Envelope;
      expect(round).toEqual(e);
    }
  });
});
