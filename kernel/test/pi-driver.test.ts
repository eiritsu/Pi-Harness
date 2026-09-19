import { describe, it, expect, afterEach } from 'vitest';
import { isKernelEvent, type KernelEvent } from '@pi-harness/protocol';
import { PiKernelDriver, fauxAssistantMessage, fauxText, fauxToolCall, type FauxRegistration } from '../src/pi-driver.js';

const WORKSPACE = '/Users/y/project';

function textMsg(text: string) {
  return fauxAssistantMessage([fauxText(text)]);
}

const drivers: PiKernelDriver[] = [];
function makeDriver(build: (r: FauxRegistration) => void): PiKernelDriver {
  const d = new PiKernelDriver({ buildResponses: build, workspaceRoot: WORKSPACE });
  drivers.push(d);
  return d;
}
afterEach(() => {
  for (const d of drivers.splice(0)) d.dispose();
});

async function createSession(d: PiKernelDriver): Promise<string> {
  let sid = '';
  const off = d.onEvent((e) => {
    if (e.type === 'session_started') sid = e.sessionId;
  });
  d.handleCommand({ type: 'create_session', projectId: null });
  off();
  expect(sid).not.toBe('');
  return sid;
}

async function collect(d: PiKernelDriver): Promise<KernelEvent[]> {
  const events: KernelEvent[] = [];
  d.onEvent((e) => events.push(e));
  return events;
}

describe('PiKernelDriver（vendored pi agent loop）', () => {
  it('纯文本会话：faux 脚本 → 流式事件 → ready', async () => {
    const d = makeDriver((r) => r.setResponses([textMsg('你好，世界')]));
    const sid = await createSession(d);
    const events = await collect(d);
    d.handleCommand({ type: 'send_user_message', sessionId: sid, text: 'hi' });
    await d.waitForIdle(sid);

    const types = events.map((e) => e.type);
    expect(types).toContain('message_start');
    expect(types).toContain('text_delta');
    expect(types).toContain('message_end');

    const full = events
      .filter((e): e is Extract<KernelEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map((e) => e.delta)
      .join('');
    expect(full).toBe('你好，世界');
    // 契约纪律：所有事件过校验器
    for (const e of events) expect(isKernelEvent(e)).toBe(true);
    // 结束态 ready
    expect(events[events.length - 1]).toMatchObject({ type: 'kernel_status', status: 'ready' });
  });

  it('审批门：默认档下工作区外写入挂起 → approve → 工具执行', async () => {
    const d = makeDriver((r) =>
      r.setResponses([
        fauxAssistantMessage([
          fauxText('写入中...'),
          fauxToolCall('fs.write', { path: '/etc/evil.txt', content: 'x' }, { id: 'call-1' }),
        ]),
        textMsg('done'),
      ]),
    );
    const sid = await createSession(d);
    const events = await collect(d);
    d.handleCommand({ type: 'send_user_message', sessionId: sid, text: 'write /etc/evil.txt' });

    // 等到审批挂起出现（runPromise 还未结束——挂在 beforeToolCall）
    await vi_waitFor(() => events.some((e) => e.type === 'approval_request'));
    const req = events.find((e): e is Extract<KernelEvent, { type: 'approval_request' }> => e.type === 'approval_request')!;
    expect(req.toolName).toBe('fs.write');

    // 上游语义：tool_execution_start 在审批门之前发出 → tool_call = "待审批"卡片
    const pendingCall = events.find((e): e is Extract<KernelEvent, { type: 'tool_call' }> => e.type === 'tool_call');
    expect(pendingCall).toBeDefined();
    expect(events.some((e) => e.type === 'tool_result')).toBe(false); // 尚未执行

    // 批准
    d.handleCommand({ type: 'resolve_approval', sessionId: sid, requestId: req.requestId, decision: 'approve' });
    await d.waitForIdle(sid);

    // 工具执行且结果 ok
    const toolResult = events.find((e): e is Extract<KernelEvent, { type: 'tool_result' }> => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    expect(toolResult!.result.ok).toBe(true);
    expect(toolResult!.result.callId).toBe('call-1');
    const approvalResolved = events.find((e): e is Extract<KernelEvent, { type: 'approval_resolved' }> => e.type === 'approval_resolved')!;
    expect(approvalResolved.decision).toBe('approve');
  });

  it('审批门：deny → 工具不执行', async () => {
    const d = makeDriver((r) =>
      r.setResponses([
        fauxAssistantMessage([
          fauxText('试试写入'),
          fauxToolCall('fs.write', { path: '/etc/evil.txt', content: 'x' }, { id: 'call-1' }),
        ]),
        textMsg('好的，不写了'),
      ]),
    );
    const sid = await createSession(d);
    const events = await collect(d);
    d.handleCommand({ type: 'send_user_message', sessionId: sid, text: 'go' });
    await vi_waitFor(() => events.some((e) => e.type === 'approval_request'));
    const req = events.find((e): e is Extract<KernelEvent, { type: 'approval_request' }> => e.type === 'approval_request')!;

    d.handleCommand({ type: 'resolve_approval', sessionId: sid, requestId: req.requestId, decision: 'deny' });
    await d.waitForIdle(sid);

    // 调用被拒：上游发 execution_end(ok:false)，工具从未真正执行
    const blocked = events.find((e): e is Extract<KernelEvent, { type: 'tool_result' }> => e.type === 'tool_result');
    expect(blocked).toBeDefined();
    expect(blocked!.result.ok).toBe(false);
    const resolved = events.find((e): e is Extract<KernelEvent, { type: 'approval_resolved' }> => e.type === 'approval_resolved')!;
    expect(resolved.decision).toBe('deny');
  });

  it('read-only 档：写入直接拒绝，不出审批卡', async () => {
    const d = makeDriver((r) =>
      r.setResponses([
        fauxAssistantMessage([
          fauxText('试试写入'),
          fauxToolCall('fs.write', { path: `${WORKSPACE}/a.txt`, content: 'x' }, { id: 'call-1' }),
        ]),
        textMsg('被拒了'),
      ]),
    );
    const sid = await createSession(d);
    const events = await collect(d);
    d.handleCommand({ type: 'set_permission_mode', sessionId: sid, mode: 'read-only' });
    d.handleCommand({ type: 'send_user_message', sessionId: sid, text: 'go' });
    await d.waitForIdle(sid);

    expect(events.some((e) => e.type === 'approval_request')).toBe(false);
    const denied = events.find((e): e is Extract<KernelEvent, { type: 'tool_result' }> => e.type === 'tool_result');
    expect(denied?.result.ok).toBe(false); // read-only 直接拒绝，不经审批
  });

  it('workspace 内写入：默认档直接放行（无需审批）', async () => {
    const d = makeDriver((r) =>
      r.setResponses([
        fauxAssistantMessage([
          fauxText('内部写入'),
          fauxToolCall('fs.write', { path: `${WORKSPACE}/a.txt`, content: 'x' }, { id: 'call-1' }),
        ]),
        textMsg('done'),
      ]),
    );
    const sid = await createSession(d);
    const events = await collect(d);
    d.handleCommand({ type: 'send_user_message', sessionId: sid, text: 'go' });
    await d.waitForIdle(sid);

    expect(events.some((e) => e.type === 'approval_request')).toBe(false);
    const result = events.find((e): e is Extract<KernelEvent, { type: 'tool_result' }> => e.type === 'tool_result');
    expect(result?.result.ok).toBe(true);
  });

  it('查询面：list_sessions / get_registry 正常回包', async () => {
    const d = makeDriver(() => {});
    const sid = await createSession(d);
    const list = await d.handleQuery({ kind: 'list_sessions' });
    expect(list.kind).toBe('list_sessions');
    if (list.kind === 'list_sessions') expect(list.sessions.map((s) => s.id)).toContain(sid);
    const reg = await d.handleQuery({ kind: 'get_registry' });
    expect(reg.kind).toBe('get_registry');
  });
});

/** 轮询等待条件成立（faux 全速流式下毫秒级） */
async function vi_waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}
