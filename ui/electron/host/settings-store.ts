/**
 * 设置持久化（host 侧）— settings.json 单文件。
 * 语义按两平面拆分：这里只存全局设置（宿主平面）；
 * 会话私有覆盖（persona/tools/权限）在预设文件里。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { PermissionMode } from '@pi-harness/protocol/contract';

export interface HarnessSettings {
  general: Record<string, unknown>;
  appearance: { theme?: 'dark' | 'light' | 'system' };
  agent: { defaultPermissionMode?: PermissionMode };
  connections: Record<string, unknown>;
}

const DEFAULTS: HarnessSettings = {
  general: {},
  appearance: { theme: 'dark' },
  agent: { defaultPermissionMode: 'sandbox_workspace_write' },
  connections: {},
};

export class SettingsStore {
  constructor(private filePath: string) {}

  load(): HarnessSettings {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf-8');
    } catch {
      return structuredClone(DEFAULTS);
    }
    try {
      const parsed = JSON.parse(raw) as Partial<HarnessSettings>;
      // 浅合并，缺省键用默认值；坏值逐键兜底
      return {
        general: parsed.general ?? DEFAULTS.general,
        appearance: { theme: parsed.appearance?.theme ?? DEFAULTS.appearance.theme },
        agent: {
          defaultPermissionMode:
            parsed.agent?.defaultPermissionMode ?? DEFAULTS.agent.defaultPermissionMode,
        },
        connections: parsed.connections ?? DEFAULTS.connections,
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  save(settings: HarnessSettings): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  }

  get<K extends keyof HarnessSettings>(section: K): HarnessSettings[K] {
    return this.load()[section];
  }

  set<K extends keyof HarnessSettings>(section: K, value: HarnessSettings[K]): HarnessSettings {
    const next = this.load();
    next[section] = value;
    this.save(next);
    return next;
  }
}
