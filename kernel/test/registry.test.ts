import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRegistrySnapshot, readPluginRegistryFile } from '../src/registry-loader.js';
import { FakeKernelDriver } from '../src/fake-driver.js';

const BUILTIN = {
  commands: [{ id: 'session.new', title: '新对话', group: 'action' as const, source: 'builtin' }],
  tools: [{ name: 'fs.read', description: '读取文件', source: 'builtin' }],
  presets: [{ id: 'default', title: '默认', permissionMode: 'sandbox_workspace_write' as const, source: 'builtin' }],
};

describe('M3 注册表加载器', () => {
  let dir = '';
  it.afterEach?.(() => {}, 0);

  it('插件文件缺失 → 只返回 builtin，不报错', () => {
    const { snapshot, errors } = loadRegistrySnapshot(BUILTIN, ['/nonexistent/plugins.json']);
    expect(errors).toHaveLength(0);
    expect(snapshot.commands).toHaveLength(1);
  });

  it('加载插件行 → 快照合并；每次调用重读（幂等投影）', () => {
    dir = mkdtempSync(join(tmpdir(), 'registry-'));
    const file = join(dir, 'plugins.json');
    // 第一次查询：还没有插件
    let r = loadRegistrySnapshot(BUILTIN, [file]);
    expect(r.snapshot.commands).toHaveLength(1);

    // 运行中写入一行插件（不改宿主代码）
    writeFileSync(file, JSON.stringify({
      commands: [{ id: 'hello.world', title: 'Hello World', group: 'action', source: 'demo' }],
    }));
    r = loadRegistrySnapshot(BUILTIN, [file]);
    expect(r.snapshot.commands.map((c) => c.id)).toContain('hello.world');
    expect(r.snapshot.commands).toHaveLength(2);

    // 删除后消失
    rmSync(file);
    r = loadRegistrySnapshot(BUILTIN, [file]);
    expect(r.snapshot.commands).toHaveLength(1);
  });

  it('坏 JSON 容错：报 error 但不拖死壳', () => {
    dir = mkdtempSync(join(tmpdir(), 'registry-'));
    const file = join(dir, 'broken.json');
    writeFileSync(file, '{ not json');
    const { errors } = loadRegistrySnapshot(BUILTIN, [file]);
    expect(errors).toHaveLength(1);
    const { fragment, errors: e2 } = readPluginRegistryFile(file);
    expect(fragment.commands ?? []).toEqual([]); // 坏文件 → 空片段
    expect(e2).toHaveLength(1);
    expect(e2).toHaveLength(1);
  });

  it('插件覆盖同名 builtin 条目', () => {
    dir = mkdtempSync(join(tmpdir(), 'registry-'));
    const file = join(dir, 'override.json');
    writeFileSync(file, JSON.stringify({
      commands: [{ id: 'session.new', title: '新会话（插件版）', group: 'action', source: 'demo' }],
    }));
    const { snapshot } = loadRegistrySnapshot(BUILTIN, [file]);
    const cmd = snapshot.commands.find((c) => c.id === 'session.new');
    expect(cmd?.title).toBe('新会话（插件版）');
  });
});

describe('M3 run_command 语义（FakeKernelDriver）', () => {
  it('session.new → 创建会话 + command_executed', async () => {
    const d = new FakeKernelDriver();
    const events: import('@pi-harness/protocol').KernelEvent[] = [];
    d.onEvent((e) => events.push(e));
    d.handleCommand({ type: 'run_command', commandId: 'session.new' });
    expect(events.some((e) => e.type === 'session_started')).toBe(true);
    expect(events.find((e) => e.type === 'command_executed')).toMatchObject({
      commandId: 'session.new',
      ok: true,
    });
    d.dispose();
  });

  it('permission.* → 当前会话权限档切换', async () => {
    const d = new FakeKernelDriver();
    let sid = '';
    const off = d.onEvent((e) => {
      if (e.type === 'session_started') sid = e.sessionId;
    });
    d.handleCommand({ type: 'create_session', projectId: null });
    off();
    const events: import('@pi-harness/protocol').KernelEvent[] = [];
    d.onEvent((e) => events.push(e));
    d.handleCommand({ type: 'run_command', commandId: 'permission.read-only', sessionId: sid });
    const done = events.find((e) => e.type === 'command_executed');
    expect(done).toMatchObject({ commandId: 'permission.read-only', ok: true });
    d.dispose();
  });

  it('未知插件命令 → command_executed ok:true（通用回执）', async () => {
    const d = new FakeKernelDriver();
    const events: import('@pi-harness/protocol').KernelEvent[] = [];
    d.onEvent((e) => events.push(e));
    d.handleCommand({ type: 'run_command', commandId: 'demo.greet' });
    expect(events.find((e) => e.type === 'command_executed')).toMatchObject({
      commandId: 'demo.greet',
      ok: true,
    });
    d.dispose();
  });
});
