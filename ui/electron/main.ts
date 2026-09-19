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
import { SettingsStore } from './host/settings-store.js';
import { PresetStore } from './host/preset-store.js';
import type { HostRequest, HostResponse } from './host/host-api.js';
import { FakeKernelDriver, PiKernelDriver } from '@pi-harness/kernel';
import type { KernelDriver } from '@pi-harness/kernel';
import type { Envelope, QueryResponse } from '@pi-harness/protocol';

let win: BrowserWindow | null = null;
let driver: KernelDriver | null = null;
let settings: SettingsStore | null = null;
let presets: PresetStore | null = null;
let lastSessionId: string | null = null;

function makeDriver(): KernelDriver {
  const which = process.env['PI_HARNESS_DRIVER'] ?? 'fake';
  // 冒号分隔的插件注册表文件（M3 验收：运行中写入即生效）
  const pluginPaths = (process.env['PI_HARNESS_PLUGIN_REGISTRY'] ?? '')
    .split(':')
    .filter((p) => p.length > 0);
  if (which === 'pi') {
    return new PiKernelDriver({ pluginRegistryPaths: pluginPaths });
  }
  return new FakeKernelDriver({ pluginRegistryPaths: pluginPaths });
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
      if (process.env['PI_HARNESS_DEBUG']) console.error('[main:event]', event.type);
      if (event.type === 'session_started') lastSessionId = event.sessionId;
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
      // 宿主平面编排：新会话应用默认权限档（M4）
      if (envelope.payload.type === 'create_session' && settings) {
        const mode = settings.get('agent').defaultPermissionMode;
        if (lastSessionId && mode && mode !== 'sandbox_workspace_write') {
          driver.handleCommand({ type: 'set_permission_mode', sessionId: lastSessionId, mode });
        }
      }
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

/** M5：应用内检查更新（检测→提示→手动 DMG 替换；Sparkle 留后续） */
async function checkForUpdate(): Promise<{
  current: string;
  latest?: string;
  updateAvailable?: boolean;
  releaseUrl?: string;
  notice?: string;
}> {
  const current = app.getVersion();
  try {
    const res = await fetch('https://api.github.com/repos/eiritsu/Pi-Harness/releases/latest', {
      headers: { 'user-agent': 'Pi-Harness-Updater' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { current, notice: `无法检查更新（HTTP ${res.status}）` };
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latest = data.tag_name?.replace(/^v/, '');
    if (!latest) return { current, notice: '仓库还没有发布版本' };
    const updateAvailable = compareSemver(latest, current) > 0;
    return { current, latest, updateAvailable, releaseUrl: data.html_url };
  } catch {
    return { current, notice: '无法检查更新（无网络）' };
  }
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function registerHostIpc(): void {
  const dataDir = process.env['PI_HARNESS_DATA_DIR'] ?? path.join(app.getPath('userData'));
  const settingsStore = new SettingsStore(path.join(dataDir, 'settings.json'));
  const presetStore = new PresetStore(path.join(dataDir, 'presets'));
  settings = settingsStore;
  presets = presetStore;

  ipcMain.handle('host:request', async (_e, req: HostRequest): Promise<HostResponse> => {
    try {
      switch (req.op) {
        case 'settings.get':
          return { ok: true, settings: settingsStore.load() };
        case 'update.check':
          return { ok: true, update: await checkForUpdate() };
        case 'settings.set': {
          const next = settingsStore.set(req.section, req.value as never);
          return { ok: true, settings: next };
        }
        case 'presets.list':
          return { ok: true, presets: presetStore.list() };
        case 'presets.create':
          return { ok: true, preset: presetStore.create(req.title) };
        case 'presets.derive':
          return { ok: true, preset: presetStore.derive(req.sourceId, req.newTitle) };
        case 'presets.delete':
          presetStore.delete(req.id);
          return { ok: true };
      }
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}

app.whenReady().then(() => {
  driver = makeDriver();
  registerIpc();
  registerHostIpc();
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
