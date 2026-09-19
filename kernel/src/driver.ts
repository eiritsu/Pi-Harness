/**
 * KernelDriver — 内核适配层的统一接口。
 *
 * M1：FakeKernelDriver（包装 protocol 的 FakeKernel，验证契约形状）。
 * M1 后续：PiKernelDriver（驱动 vendored pi 的 agent loop，对接同一接口）。
 * golden 回放、UI、e2e 全部只依赖本接口——内核可替换，测试不换血。
 */
import type {
  Envelope,
  KernelCommand,
  KernelEvent,
  Query,
  QueryResponse,
} from '@pi-harness/protocol';

export interface KernelDriver {
  /** kernel → ui 事件流订阅；返回退订函数 */
  onEvent(listener: (event: KernelEvent) => void): () => void;
  /** ui → kernel 命令（fire-and-forget） */
  handleCommand(command: KernelCommand): void;
  /** ui → kernel 查询；Promise 以 query_response 回包结算 */
  handleQuery(query: Query): Promise<QueryResponse>;
  /** 释放内核资源（子进程、句柄等） */
  dispose(): void;
}

/**
 * Driver 纪律（所有实现必须遵守，golden 测试会抽查）：
 * 1. 发出的每个事件必须能过 protocol 的 isKernelEvent；
 * 2. 查询响应必须与请求 id 配对、恰好一次；
 * 3. 审批请求发出后必须停在该工具前，收到 resolve 才继续。
 */
export interface DriverEvents {
  /** 诊断用：driver 内部错误（不得吞掉，也不得崩宿主） */
  onError?(err: Error): void;
}

export type { Envelope };
