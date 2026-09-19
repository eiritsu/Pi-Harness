/**
 * Golden 回放框架 — M1 内核测试的地基。
 *
 * 原理：脚本化会话 → 记录事件流 → 规范化（剥离时间戳等易变字段）→
 * 与 tests/golden/<name>.json 快照逐行比对。任何契约行为变化都会打红。
 *
 * 真内核接入后，同一套 harness 换 driver 即可；快照格式不变。
 */
import { isKernelEvent } from '@pi-harness/protocol';
import type { KernelEvent } from '@pi-harness/protocol';

/** 单个事件快照行：类型 + 规范化后的载荷 */
export interface GoldenRecord {
  seq: number;
  type: KernelEvent['type'];
  /** 规范化后的事件载荷（易变字段替换为占位符） */
  payload: Record<string, unknown>;
}

/**
 * 规范化规则：
 * - createdAt / 时间戳 → "<ts>"
 * - 自增 id（session-N / req-N / call-N）→ "<id:N 类别>"（保留配对关系）
 */
export function normalizeEvent(event: KernelEvent, idMap: Map<string, string>): GoldenRecord {
  const replaceIds = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (/^(session|req|call)-\d+$/.test(v)) {
        let mapped = idMap.get(v);
        if (!mapped) {
          mapped = `<id:${v.split('-')[0]}>`;
          idMap.set(v, mapped);
        }
        return mapped;
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(replaceIds);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = replaceIds(val);
      return out;
    }
    return v;
  };

  const scrubbed = replaceIds(structuredClone(event)) as Record<string, unknown>;
  // createdAt 是墙钟时间，一律抹掉
  const scrubTs = (o: Record<string, unknown>): void => {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'createdAt' && typeof v === 'string') o[k] = '<ts>';
      else if (v !== null && typeof v === 'object') scrubTs(v as Record<string, unknown>);
    }
  };
  scrubTs(scrubbed);

  if (!isKernelEvent(scrubbed as unknown)) {
    throw new Error(`golden: 规范化后的事件不再满足契约: ${JSON.stringify(scrubbed).slice(0, 200)}`);
  }
  return { seq: 0, type: event.type, payload: scrubbed };
}

/** 便捷序列化：快照文件就是它输出的 JSON（稳定排序） */
export function serializeRecords(records: GoldenRecord[]): string {
  const withSeq = records.map((r, i) => ({ ...r, seq: i + 1 }));
  return JSON.stringify(withSeq, null, 2) + '\n';
}

/**
 * 收集事件流的 recorder。用法：
 *   const rec = new Recorder(); driver.onEvent(rec.push); ...run...; rec.finish()
 */
export class Recorder {
  private records: GoldenRecord[] = [];
  private idMap = new Map<string, string>();
  private done = false;

  push = (event: KernelEvent): void => {
    if (this.done) throw new Error('golden: finish 后仍收到事件');
    this.records.push(normalizeEvent(event, this.idMap));
  };

  finish(): GoldenRecord[] {
    this.done = true;
    return this.records;
  }
}
