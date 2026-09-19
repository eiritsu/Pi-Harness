/**
 * M1 golden 回放测试 — 事件流快照比对。
 *
 * 更新快照：UPDATE_GOLDEN=1 pnpm test （人工审查 diff 后提交）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { FakeKernelDriver, Recorder, serializeRecords, type GoldenRecord } from '../src/index.js';
import type { ScriptStep } from '@pi-harness/protocol';

const GOLDEN_DIR = join(import.meta.dirname, 'golden');
const UPDATE = process.env['UPDATE_GOLDEN'] === '1';

/** 驱动一个完整场景并收集规范化事件流 */
async function runScenario(
  script: (driver: FakeKernelDriver) => Promise<void>,
): Promise<GoldenRecord[]> {
  const driver = new FakeKernelDriver();
  const rec = new Recorder();
  const off = driver.onEvent(rec.push);
  try {
    await script(driver);
  } finally {
    off();
    driver.dispose();
  }
  return rec.finish();
}

async function expectGolden(name: string, records: GoldenRecord[]): Promise<void> {
  const file = join(GOLDEN_DIR, `${name}.json`);
  const actual = serializeRecords(records);
  if (UPDATE || !existsSync(file)) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(file, actual, 'utf-8');
    // 首次生成时也做一次基本断言，防止空快照
    expect(records.length).toBeGreaterThan(0);
    return;
  }
  const expected = readFileSync(file, 'utf-8');
  expect(actual).toBe(expected);
}

/** 通用前置：建会话，返回 sessionId */
async function createSession(d: FakeKernelDriver): Promise<string> {
  d.handleCommand({ type: 'create_session', projectId: null });
  // session_started 是同步推的，此时最新快照里能找到 id；
  // 用 list_sessions 查询拿真实 id（driver 查询路径也被覆盖）
  const resp = await d.handleQuery({ kind: 'list_sessions' });
  if (resp.kind !== 'list_sessions' || resp.sessions.length === 0) {
    throw new Error('scenario: session 未创建');
  }
  return resp.sessions[resp.sessions.length - 1]!.id;
}

describe('M1 golden 回放（FakeKernelDriver）', () => {
  it('golden/pure-text：纯文本流式会话', async () => {
    const records = await runScenario(async (d) => {
      const sid = await createSession(d);
      d.runScriptStep(sid, {
        userText: '你好',
        textDeltas: ['你', '好', '！'],
      });
      d.handleCommand({ type: 'send_user_message', sessionId: sid, text: '你好' });
    });
    await expectGolden('pure-text', records);
  });

  it('golden/tool-call：工具调用与结果 callId 配对', async () => {
    const records = await runScenario(async (d) => {
      const sid = await createSession(d);
      d.runScriptStep(sid, {
        userText: 'read /tmp/a.txt',
        textDeltas: ['reading...'],
        toolCalls: [{ name: 'fs.read', args: { path: '/tmp/a.txt' } }],
        toolResults: [{ ok: true, output: 'content' }],
      });
    });
    // 配对不变量独立断言（快照之外的双重保险）
    const call = records.find((r) => r.type === 'tool_call');
    const result = records.find((r) => r.type === 'tool_result');
    expect(call).toBeDefined();
    expect(result).toBeDefined();
    expect(result!.payload['callId']).toBe(call!.payload['callId']);
    await expectGolden('tool-call', records);
  });

  it('golden/approval-deny：默认档挂起审批，deny 后不执行', async () => {
    const records = await runScenario(async (d) => {
      const sid = await createSession(d);
      const step: ScriptStep = {
        userText: 'rm',
        textDeltas: ['危险操作'],
        approval: { toolName: 'bash', detail: 'rm -rf ./dist', reason: '工作区外写入' },
        toolCalls: [{ name: 'bash', args: { cmd: 'rm -rf ./dist' } }],
        toolResults: [{ ok: true, output: '' }],
      };
      d.runScriptStep(sid, step);
      // 从挂起事件中拿 requestId（规范化前的原始事件流里有真实值，
      // 但 recorder 只留规范化后的；这里直接 deny 一个占位 id —— fake kernel 只回放 decision）
      d.resolveApprovalAndContinue(sid, step, 'deny');
    });
    // deny 路径：不应出现 tool_call
    expect(records.find((r) => r.type === 'tool_call')).toBeUndefined();
    await expectGolden('approval-deny', records);
  });

  it('golden/permission-auto：auto 档跳过审批直接执行', async () => {
    const records = await runScenario(async (d) => {
      const sid = await createSession(d);
      d.handleCommand({ type: 'set_permission_mode', sessionId: sid, mode: 'auto' });
      d.runScriptStep(sid, {
        userText: 'go',
        textDeltas: ['ok'],
        approval: { toolName: 'bash', detail: 'ls', reason: '任意' },
        toolCalls: [{ name: 'bash', args: { cmd: 'ls' } }],
        toolResults: [{ ok: true, output: 'files' }],
      });
    });
    expect(records.find((r) => r.type === 'approval_request')).toBeUndefined();
    await expectGolden('permission-auto', records);
  });

  it('golden/registry：注册表查询与未知会话错误路径（纯查询，无事件流）', async () => {
    const driver = new FakeKernelDriver();
    try {
      const reg = await driver.handleQuery({ kind: 'get_registry' });
      expect(reg.kind).toBe('get_registry');
      const err = await driver.handleQuery({ kind: 'get_session', sessionId: 'nope' });
      expect(err.kind).toBe('get_session_error');
    } finally {
      driver.dispose();
    }
  });
});
