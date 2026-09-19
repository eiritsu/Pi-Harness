/**
 * 预设库（host 侧）— 一预设一 JSON 文件，目录即库。
 * 操作：list / create / derive / delete。派生 = 复制源文件改 id+title。
 * 预设是会话私有平面的载体（persona/工具/权限覆盖），M4 落权限档字段。
 */
import { readFileSync, readdirSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { PermissionMode } from '@pi-harness/protocol/contract';

export interface PresetFile {
  id: string;
  title: string;
  permissionMode: PermissionMode;
  description?: string;
  /** 派生来源（builtin 预设无此字段） */
  derivedFrom?: string;
}

export class PresetStore {
  constructor(private dir: string) {}

  private fileOf(id: string): string {
    // id 即文件名（slug 约束在 create/derive 时保证）
    return path.join(this.dir, `${id}.json`);
  }

  list(): PresetFile[] {
    let entries: string[];
    try {
      entries = readdirSync(this.dir);
    } catch {
      return [];
    }
    const out: PresetFile[] = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      try {
        const parsed = JSON.parse(readFileSync(path.join(this.dir, name), 'utf-8')) as PresetFile;
        if (typeof parsed.id === 'string' && typeof parsed.title === 'string') out.push(parsed);
      } catch {
        // 坏文件跳过，不拖死库
      }
    }
    return out;
  }

  get(id: string): PresetFile | undefined {
    try {
      return JSON.parse(readFileSync(this.fileOf(id), 'utf-8')) as PresetFile;
    } catch {
      return undefined;
    }
  }

  /** slug 化：小写、空白与非法字符转 -，供 id/文件名 */
  private slug(title: string, fallbackSeed: string): string {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base.length > 0 ? base.slice(0, 48) : fallbackSeed;
  }

  create(title: string, permissionMode: PermissionMode = 'sandbox_workspace_write'): PresetFile {
    mkdirSync(this.dir, { recursive: true });
    let id = this.slug(title, 'preset');
    let n = 2;
    while (this.get(id) !== undefined) id = `${this.slug(title, 'preset')}-${n++}`;
    const preset: PresetFile = { id, title, permissionMode };
    writeFileSync(this.fileOf(id), JSON.stringify(preset, null, 2) + '\n', 'utf-8');
    return preset;
  }

  derive(sourceId: string, newTitle: string): PresetFile {
    const source = this.get(sourceId);
    if (!source) throw new Error(`preset not found: ${sourceId}`);
    const derived = this.create(newTitle, source.permissionMode);
    const file = JSON.parse(readFileSync(this.fileOf(derived.id), 'utf-8')) as PresetFile;
    file.derivedFrom = sourceId;
    file.description = source.description;
    writeFileSync(this.fileOf(derived.id), JSON.stringify(file, null, 2) + '\n', 'utf-8');
    return file;
  }

  delete(id: string): void {
    try {
      unlinkSync(this.fileOf(id));
    } catch {
      // 不存在视为已删除
    }
  }
}
