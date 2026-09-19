/**
 * Electron 主进程 — 宿主 KernelDriver，IPC 桥走 protocol v1 信封。
 *
 * 通信面（与 M0 契约一一对应）：
 *   renderer → main : ipcMain.handle('harness:envelope', command | query)
 *   main → renderer : webContents.send('harness:event', event)
 *
 * Driver 选择：PI_HARNESS_DRIVER=fake（默认，确定性冒烟）| pi（faux 脚本内核）。
 * 真实模型 provider 接入后由 host 模型路由提供，driver 结构不变。
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { FakeKernelDriver, PiKernelDriver } from '@pi-harness/kernel';
import type { KernelDriver } from '@pi-harness/kernel';
import type { Envelope, QueryResponse } from '@pi-harness/protocol';

let win: BrowserWindow | null = null;
let driver: KernelDriver | null = null;

function makeDriver(): KernelDriver {
  const which = process.env['PI_HARNESS_DRIVER'] ?? 'fake';
  if (which === 'pi') {
    return new PiKernelDriver();
  }
  return new FakeKernelDriver();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d0d0d',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要 require('electron')；渲染进程仍是隔离的
    },
  });

  const rendererIndex = path.join(__dirname, '..', 'renderer', 'index.html');
  void win.loadFile(rendererIndex);

  win.webContents.on('did-finish-load', () => {
    // 事件通道：driver → renderer
    driver?.onEvent((event) => {
      if (win && !win.isDestroyed()) {
        const envelope: Envelope = { channel: 'event', payload: event };
        win.webContents.send('harness:event', envelope);
      }
    });
  });
}

function registerIpc(): void {
  ipcMain.handle('harness:envelope', async (_event, envelope: Envelope) => {
    if (!driver) return;
    if (envelope.channel === 'command') {
      driver.handleCommand(envelope.payload);
      return;
    }
    if (envelope.channel === 'query') {
      const payload: QueryResponse = await driver.handleQuery(envelope.payload);
      if (win && !win.isDestroyed()) {
        win.webContents.send('harness:event', {
          channel: 'query_response',
          id: envelope.id,
          payload,
        } satisfies Envelope);
      }
      return;
    }
  });
}

app.whenReady().then(() => {
  driver = makeDriver();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  driver?.dispose();
  driver = null;
  if (process.platform !== 'darwin') app.quit();
});

// 崩溃零容忍（M2 退出标准）：主进程未捕获异常直接记录并退出
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException', err);
  app.quit();
  process.exitCode = 1;
});
