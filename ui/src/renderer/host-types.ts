/** host 通道类型（与 electron/host 的实现保持形状一致；renderer 侧仅类型） */
import type { PermissionMode } from '@pi-harness/protocol/contract';
export type { PermissionMode };

export interface PresetFile {
  id: string;
  title: string;
  permissionMode: PermissionMode;
  description?: string;
  derivedFrom?: string;
}

export type HostRequest =
  | { op: 'settings.get' }
  | { op: 'update.check' }
  | { op: 'settings.set'; section: string; value: unknown }
  | { op: 'presets.list' }
  | { op: 'presets.create'; title: string }
  | { op: 'presets.derive'; sourceId: string; newTitle: string }
  | { op: 'presets.delete'; id: string };

export interface HarnessSettingsHost {
  general: Record<string, unknown>;
  appearance: { theme?: 'dark' | 'light' | 'system' };
  agent: { defaultPermissionMode?: PermissionMode };
  connections: Record<string, unknown>;
}

export interface UpdateInfoHost {
  current: string;
  latest?: string;
  updateAvailable?: boolean;
  releaseUrl?: string;
  notice?: string;
}

declare global {
  interface Window {
    hostApi?: {
      request(req: HostRequest): Promise<{ ok: boolean; error?: string; settings?: HarnessSettingsHost; presets?: PresetFile[]; preset?: PresetFile; update?: UpdateInfoHost }>;
    };
  }
}
