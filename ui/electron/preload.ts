/**
 * Preload — contextBridge 暴露最小 IPC 面。
 * 渲染进程只能看到 harness.send / harness.onEvent，拿不到 node 能力。
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { Envelope } from '@pi-harness/protocol';

const api = {
  /** ui → kernel：command / query 信封 */
  send: (envelope: Envelope): void => {
    void ipcRenderer.invoke('harness:envelope', envelope);
  },
  /** kernel → ui：事件与查询回包（返回退订函数） */
  onEvent: (listener: (envelope: Envelope) => void): (() => void) => {
    const handler = (_e: unknown, envelope: Envelope): void => listener(envelope);
    ipcRenderer.on('harness:event', handler);
    return () => {
      ipcRenderer.removeListener('harness:event', handler);
    };
  },
};

contextBridge.exposeInMainWorld('harness', api);

export type HarnessApi = typeof api;
