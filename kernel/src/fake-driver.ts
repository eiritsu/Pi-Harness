/**
 * FakeKernelDriver — FakeKernel 的 driver 包装。
 * 用途：在真内核接入前，让 golden 回放与 e2e 有确定性的内核可用。
 */
import { FakeKernel, type ScriptStep } from '@pi-harness/protocol';
import type {
  KernelCommand,
  KernelEvent,
  Query,
  QueryResponse,
} from '@pi-harness/protocol';
import type { KernelDriver } from './driver.js';

export class FakeKernelDriver implements KernelDriver {
  private kernel: FakeKernel;
  private listeners = new Set<(e: KernelEvent) => void>();

  constructor() {
    this.kernel = new FakeKernel();
    this.kernel.on((envelope) => {
      if (envelope.channel !== 'event') return;
      for (const l of [...this.listeners]) l(envelope.payload);
    });
  }

  onEvent(listener: (event: KernelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  handleCommand(command: KernelCommand): void {
    this.kernel.handleCommand(command);
  }

  handleQuery(query: Query): Promise<QueryResponse> {
    // FakeKernel 的 query 是同步回放；用 0 号 id 语义上无歧义（一次一个 waiter）
    return new Promise((resolve) => {
      const off = this.kernel.on((envelope) => {
        if (envelope.channel === 'query_response') {
          off();
          resolve(envelope.payload);
        }
      });
      this.kernel.handleQuery(0, query);
    });
  }

  /** 测试钩子：驱动一轮脚本化回复（真内核没有这个方法） */
  runScriptStep(sessionId: string, step: ScriptStep): void {
    this.kernel.runScriptStep(sessionId, step);
  }

  resolveApprovalAndContinue(sessionId: string, step: ScriptStep, decision: 'deny' | 'approve' | 'approve-always'): void {
    this.kernel.resolveApprovalAndContinue(sessionId, step, decision);
  }

  dispose(): void {
    this.listeners.clear();
  }
}
