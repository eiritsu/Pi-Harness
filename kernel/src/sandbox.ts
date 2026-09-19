/**
 * 沙箱策略 — 权限档 × 工具风险 的唯一裁决点。
 *
 * M1 只做声明式裁决（允许/需审批/拒绝）；seatbelt 进程加固是 v2。
 * 这里的每个判定都必须是纯函数——golden 测试直接全矩阵打表。
 */
import type { PermissionMode } from '@pi-harness/protocol';

export type ToolRisk = 'read' | 'write' | 'execute';

export type Verdict = 'allow' | 'approval' | 'deny';

export interface SandboxedRequest {
  toolName: string;
  risk: ToolRisk;
  /** 相对工作区的目标路径（fs 工具）；bash 为 undefined */
  path?: string;
  workspaceRoot?: string;
}

const WRITE_EXEC_TOOLS = new Set(['fs.write', 'bash']);

/**
 * 裁决矩阵（docs/DEV-PLAN §M1 验收②）：
 *
 * | mode                   | read      | write(工作区内) | write(工作区外) | execute |
 * |------------------------|-----------|----------------|----------------|---------|
 * | read-only              | allow     | deny           | deny           | deny    |
 * | sandbox_workspace_write| allow     | allow          | approval       | approval|
 * | full-access            | allow     | allow          | allow          | allow   |
 * | auto                   | allow     | allow          | allow          | allow   |
 */
export function judge(req: SandboxedRequest, mode: PermissionMode): Verdict {
  switch (mode) {
    case 'auto':
    case 'full-access':
      return 'allow';
    case 'read-only':
      return req.risk === 'read' ? 'allow' : 'deny';
    case 'sandbox_workspace_write': {
      if (req.risk === 'read') return 'allow';
      if (req.risk === 'write' && req.path && req.workspaceRoot) {
        return isInsideWorkspace(req.path, req.workspaceRoot) ? 'allow' : 'approval';
      }
      return 'approval';
    }
  }
}

/** 路径包含判定：规范化后必须落在工作区内（防 ../ 逃逸） */
export function isInsideWorkspace(target: string, root: string): boolean {
  const normTarget = normalize(target);
  const normRoot = normalize(root);
  if (normTarget === normRoot) return true;
  return normTarget.startsWith(normRoot.endsWith('/') ? normRoot : normRoot + '/');
}

/** 最小路径规范化：解析 . 与 ..；不触盘（不 resolve symlink） */
function normalize(p: string): string {
  const isAbs = p.startsWith('/');
  const parts = p.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!isAbs) out.push('..');
      continue;
    }
    out.push(part);
  }
  const joined = (isAbs ? '/' : '') + out.join('/');
  return joined === '' ? '.' : joined;
}

export { WRITE_EXEC_TOOLS };
