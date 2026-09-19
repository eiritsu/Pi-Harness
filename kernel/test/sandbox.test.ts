import { describe, it, expect } from 'vitest';
import { judge, isInsideWorkspace, type SandboxedRequest } from '../src/sandbox.js';

const ROOT = '/Users/y/project';

function req(over: Partial<SandboxedRequest>): SandboxedRequest {
  return {
    toolName: 'fs.write',
    risk: 'write',
    workspaceRoot: ROOT,
    ...over,
  };
}

describe('沙箱裁决矩阵（M1 验收②）', () => {
  it('read-only：读放行，写/执行全部拒绝', () => {
    expect(judge(req({ risk: 'read', toolName: 'fs.read' }), 'read-only')).toBe('allow');
    expect(judge(req({ risk: 'write' }), 'read-only')).toBe('deny');
    expect(judge(req({ risk: 'execute', toolName: 'bash' }), 'read-only')).toBe('deny');
  });

  it('sandbox_workspace_write：工作区内写放行，工作区外写需审批，执行需审批', () => {
    expect(judge(req({ risk: 'read', toolName: 'fs.read' }), 'sandbox_workspace_write')).toBe('allow');
    expect(judge(req({ path: `${ROOT}/src/a.ts` }), 'sandbox_workspace_write')).toBe('allow');
    expect(judge(req({ path: '/etc/hosts' }), 'sandbox_workspace_write')).toBe('approval');
    expect(judge(req({ risk: 'execute', toolName: 'bash' }), 'sandbox_workspace_write')).toBe('approval');
  });

  it('full-access 与 auto：一律放行', () => {
    for (const mode of ['full-access', 'auto'] as const) {
      expect(judge(req({ risk: 'read' }), mode)).toBe('allow');
      expect(judge(req({ path: '/etc/hosts' }), mode)).toBe('allow');
      expect(judge(req({ risk: 'execute' }), mode)).toBe('allow');
    }
  });

  it('路径逃逸防护：.. 与编码变体都算工作区外', () => {
    expect(isInsideWorkspace(`${ROOT}/src/a.ts`, ROOT)).toBe(true);
    expect(isInsideWorkspace(ROOT, ROOT)).toBe(true);
    expect(isInsideWorkspace(`${ROOT}/../secret`, ROOT)).toBe(false);
    expect(isInsideWorkspace('/Users/y/project-evil/a.ts', ROOT)).toBe(false);
    expect(isInsideWorkspace('relative/file.ts', ROOT)).toBe(false);
  });

  it('完整矩阵快照：4 权限档 × 3 风险级（write 用界内/界外两个样本）', () => {
    const modes = ['read-only', 'sandbox_workspace_write', 'full-access', 'auto'] as const;
    const cases: Array<Partial<SandboxedRequest>> = [
      { risk: 'read', toolName: 'fs.read' },
      { risk: 'write', path: `${ROOT}/in.txt` },
      { risk: 'write', path: '/tmp/out.txt' },
      { risk: 'execute', toolName: 'bash' },
    ];
    const table = modes.map((mode) => ({
      mode,
      verdicts: cases.map((c) => judge(req(c), mode)),
    }));
    expect(table).toMatchObject([
      { mode: 'read-only', verdicts: ['allow', 'deny', 'deny', 'deny'] },
      { mode: 'sandbox_workspace_write', verdicts: ['allow', 'allow', 'approval', 'approval'] },
      { mode: 'full-access', verdicts: ['allow', 'allow', 'allow', 'allow'] },
      { mode: 'auto', verdicts: ['allow', 'allow', 'allow', 'allow'] },
    ]);
  });
});
