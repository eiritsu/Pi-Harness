import { test, expect } from '@playwright/test';
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

let app: ElectronApplication;
let page: Page;
let pluginFile: string;

test.beforeAll(async () => {
  // M3 验收：插件注册表文件初始为空
  pluginFile = path.join(mkdtempSync(join(tmpdir(), 'pih-e2e-')), 'plugins.json');
  writeFileSync(pluginFile, JSON.stringify({}));

  app = await _electron.launch({
    args: [path.join(import.meta.dirname, '..', '..', 'dist', 'main', 'main.cjs')],
    env: {
      ...process.env,
      PI_HARNESS_DRIVER: 'fake',
      PI_HARNESS_PLUGIN_REGISTRY: pluginFile,
      NODE_ENV: 'test',
    },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app.close();
});

test('M3：⌘K 面板查表渲染 + 内置命令执行', async () => {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByTestId('palette')).toBeVisible();
  await page.getByTestId('palette-input').fill('新对话');
  await page.getByTestId('palette-item').first().click();
  // session.new 语义化执行 → 会话行出现 + 底部日志回执
  await expect(page.getByTestId('session-row').first()).toBeVisible();
  await expect(page.getByTestId('event-log')).toContainText('session.new');
});

test('M3 验收：不改宿主代码，插件文件加一行 → ⌘K 出现并执行', async () => {
  // 运行中写入一行插件命令
  writeFileSync(pluginFile, JSON.stringify({
    commands: [{ id: 'hello.world', title: 'Hello World', group: 'action', source: 'demo-plugin' }],
  }));

  await page.keyboard.press('ControlOrMeta+k'); // 打开面板 → 重查注册表
  await page.getByTestId('palette-input').fill('Hello');
  await page.getByTestId('palette-item').first().click();

  // 执行回执落在底部事件日志
  await expect(page.getByTestId('event-log')).toContainText('hello.world', { timeout: 5000 });
});

test('M3：右面板工具列表查表渲染', async () => {
  await expect(page.getByTestId('right-panel')).toBeVisible();
  await expect(page.getByTestId('tool-row').first()).toContainText('fs.');
});
