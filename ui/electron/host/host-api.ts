/**
 * Host API — main 进程暴露给 renderer 的宿主服务面。
 *
 * 与 kernel 契约（protocol Envelope）刻意分离：设置与预设是宿主平面资产，
 * 不是内核状态。applyPreset 返回预设内容，由 UI 编排既有 kernel 命令
 * （set_permission_mode），kernel 不需要知道预设的存在。
 */
import type { PresetFile } from './preset-store.js';
import type { HarnessSettings } from './settings-store.js';

export type HostRequest =
  | { op: 'settings.get' }
  | { op: 'update.check' }
  | { op: 'settings.set'; section: keyof HarnessSettings; value: unknown }
  | { op: 'presets.list' }
  | { op: 'presets.create'; title: string }
  | { op: 'presets.derive'; sourceId: string; newTitle: string }
  | { op: 'presets.delete'; id: string };

export interface UpdateInfo {
  current: string;
  latest?: string;
  updateAvailable?: boolean;
  releaseUrl?: string;
  /** 检查失败的原因（无 release / 无网络） */
  notice?: string;
}

export interface HostResponse {
  ok: boolean;
  settings?: HarnessSettings;
  presets?: PresetFile[];
  preset?: PresetFile;
  update?: UpdateInfo;
  error?: string;
}
