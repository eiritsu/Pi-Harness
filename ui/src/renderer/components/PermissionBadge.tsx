import type { PermissionMode } from '@pi-harness/protocol/contract';

export const LABELS: Record<PermissionMode, string> = {
  'read-only': '只读',
  sandbox_workspace_write: '工作区写入',
  'full-access': '完全访问',
  auto: '自动',
};

const DANGER: Record<PermissionMode, boolean> = {
  'read-only': false,
  sandbox_workspace_write: false,
  'full-access': true,
  auto: true,
};

/** 权限档指示器 — 安全总开关，常驻可见（Composer 内） */
export function PermissionBadge(props: {
  mode: PermissionMode | undefined;
  onCycle: () => void;
}) {
  if (!props.mode) return null;
  return (
    <button
      className={`perm-badge${DANGER[props.mode] ? ' danger' : ''}`}
      data-testid="perm-badge"
      data-mode={props.mode}
      title="点击切换权限档"
      onClick={props.onCycle}
    >
      ⛨ {LABELS[props.mode]}
    </button>
  );
}

export const PERMISSION_ORDER: PermissionMode[] = [
  'read-only',
  'sandbox_workspace_write',
  'full-access',
  'auto',
];

export function nextMode(mode: PermissionMode): PermissionMode {
  const i = PERMISSION_ORDER.indexOf(mode);
  return PERMISSION_ORDER[(i + 1) % PERMISSION_ORDER.length]!;
}
