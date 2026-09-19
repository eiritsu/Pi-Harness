import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SettingsStore } from '../../electron/host/settings-store.js';
import { PresetStore } from '../../electron/host/preset-store.js';

describe('SettingsStore 持久化（M4 退出标准）', () => {
  it('set → 落盘；新实例 load 读回（重启语义）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pih-set-'));
    const file = join(dir, 'settings.json');
    const s1 = new SettingsStore(file);
    s1.set('agent', { defaultPermissionMode: 'full-access' });
    expect(existsSync(file)).toBe(true);

    const s2 = new SettingsStore(file); // 模拟重启
    expect(s2.get('agent').defaultPermissionMode).toBe('full-access');
  });

  it('文件缺失 → 默认值；坏 JSON → 默认值不崩', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pih-set-'));
    expect(new SettingsStore(join(dir, 'none.json')).get('agent').defaultPermissionMode).toBe('sandbox_workspace_write');
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{oops');
    expect(new SettingsStore(bad).load().appearance.theme).toBe('dark');
  });
});

describe('PresetStore 预设库（M4：新建/派生/删除/热切换数据）', () => {
  it('create → list → derive（记录来源）→ delete', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pih-preset-'));
    const store = new PresetStore(dir);

    const p1 = store.create('Coder');
    expect(p1.permissionMode).toBe('sandbox_workspace_write');
    expect(store.list().map((x: { id: string }) => x.id)).toContain('coder');

    // 改权限档后派生：继承模式
    writeFileSync(join(dir, 'coder.json'), JSON.stringify({ ...p1, permissionMode: 'full-access' }));
    const p2 = store.derive('coder', 'Coder 副本');
    expect(p2.permissionMode).toBe('full-access');
    expect(p2.derivedFrom).toBe('coder');

    store.delete('coder');
    expect(store.get('coder')).toBeUndefined();
    expect(store.get(p2.id)).toBeDefined(); // 派生体还在

    // 再删同名不崩
    store.delete('coder');
  });

  it('同名新建自动改名；坏文件跳过', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pih-preset-'));
    const store = new PresetStore(dir);
    const a = store.create('Reviewer');
    const b = store.create('Reviewer');
    expect(a.id).not.toBe(b.id);
    writeFileSync(join(dir, 'broken.json'), '{bad');
    expect(store.list().every((p: { id: string }) => typeof p.id === 'string')).toBe(true);
  });

  it('settings.json 由 UI 写入后可读回（e2e 前置语义验证）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pih-set-'));
    const file = join(dir, 'settings.json');
    new SettingsStore(file).set('agent', { defaultPermissionMode: 'read-only' });
    expect(JSON.parse(readFileSync(file, 'utf-8')).agent.defaultPermissionMode).toBe('read-only');
  });
});
