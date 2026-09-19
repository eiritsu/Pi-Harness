/**
 * 注册表加载器 — "壳硬编码，内容查注册表"的读取端。
 *
 * 快照 = builtin（driver 内置）+ 插件文件（可多个，每次查询重读）。
 * 插件文件是 JSON，缺省键为空；坏 JSON 记 onError 并跳过（坏插件不能拖死壳）。
 * M3 验收：不改宿主代码，往插件文件加一行，⌘K 即出现新命令。
 */
import { readFileSync } from 'node:fs';
import type {
  RegistryCommandEntry,
  RegistryPresetEntry,
  RegistrySnapshot,
  RegistryToolEntry,
} from './index.js';

export interface PluginRegistryFile {
  commands?: RegistryCommandEntry[];
  tools?: RegistryToolEntry[];
  presets?: RegistryPresetEntry[];
}

export interface RegistryLoadResult {
  snapshot: RegistrySnapshot;
  /** 加载过程中的问题（文件缺失不算问题） */
  errors: string[];
}

/** 读单个插件文件；不存在返回空片段 */
export function readPluginRegistryFile(filePath: string): { fragment: PluginRegistryFile; errors: string[] } {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return { fragment: {}, errors: [] };
  }
  try {
    const parsed = JSON.parse(raw) as PluginRegistryFile;
    return {
      fragment: {
        commands: Array.isArray(parsed.commands) ? parsed.commands : [],
        tools: Array.isArray(parsed.tools) ? parsed.tools : [],
        presets: Array.isArray(parsed.presets) ? parsed.presets : [],
      },
      errors: [],
    };
  } catch (err) {
    return { fragment: {}, errors: [`plugin registry 解析失败 (${filePath}): ${String(err)}`] };
  }
}

/**
 * 合并 builtin + 插件片段。每次调用重读文件（幂等投影，无缓存失效问题）。
 * 插件条目 id 与 builtin 冲突时插件覆盖（用户区覆盖内置，与 skills 语义一致）。
 */
export function loadRegistrySnapshot(
  builtin: RegistrySnapshot,
  pluginPaths: string[],
  onError?: (message: string) => void,
): RegistryLoadResult {
  const errors: string[] = [];
  const commands = new Map<string, RegistryCommandEntry>();
  const tools = new Map<string, RegistryToolEntry>();
  const presets = new Map<string, RegistryPresetEntry>();

  for (const c of builtin.commands) commands.set(c.id, c);
  for (const t of builtin.tools) tools.set(t.name, t);
  for (const p of builtin.presets) presets.set(p.id, p);

  for (const path of pluginPaths) {
    const { fragment, errors: fileErrors } = readPluginRegistryFile(path);
    errors.push(...fileErrors);
    for (const c of fragment.commands ?? []) commands.set(c.id, c);
    for (const t of fragment.tools ?? []) tools.set(t.name, t);
    for (const p of fragment.presets ?? []) presets.set(p.id, p);
  }

  for (const e of errors) onError?.(e);

  return {
    snapshot: {
      commands: [...commands.values()],
      tools: [...tools.values()],
      presets: [...presets.values()],
    },
    errors,
  };
}
