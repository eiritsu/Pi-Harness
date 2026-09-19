import { test, expect } from '@playwright/test';
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let app: ElectronApplication;
let page: Page;
let dataDir: string;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pih-m4-'));
  mkdirSync(join(dataDir, 'presets'), { recursive: true });
  // 预置预设：完全访问档（host 侧资产，测试准备数据）
  writeFileSync(
    join(dataDir, 'presets', 'coder.json'),
    JSON.stringify({ id: 'coder', title: 'Coder', permissionMode: 'full-access' }),
  );

  app = await _electron.launch({
    args: [path.join(import.meta.dirname, '..', '..', 'dist', 'main', 'main.cjs')],
    env: {
      ...process.env,
      PI_HARNESS_DRIVER: 'fake',
      PI_HARNESS_DATA_DIR: dataDir,
      NODE_ENV: 'test',
    },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app.close();
});

test('M4：app.settings 命令打开设置页', async () => {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByTestId('palette-input').fill('设置');
  await page.getByTestId('palette-item').first().click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByRole('button', { name: '预设库' }).click();
  await expect(page.getByTestId('settings-presets')).toBeVisible();
  await page.keyboard.press('Escape'); // 收尾：不挡后续用例
});

test('M4：切预设 → 权限档即时变化（热切换）', async () => {
  // 先建会话
  await page.getByTestId('new-chat').click();
  await expect(page.getByTestId('session-row').first()).toBeVisible();
  // 默认档 badge
  await expect(page.getByTestId('perm-badge')).toHaveAttribute('data-mode', 'sandbox_workspace_write');

  // 打开设置 → 预设库 → 应用 Coder（full-access）
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByTestId('palette-input').fill('设置');
  await page.getByTestId('palette-item').first().click();
  await page.getByRole('button', { name: '预设库' }).click();
  await page.getByTestId('preset-apply').first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('perm-badge')).toHaveAttribute('data-mode', 'full-access');
});

test('M4：badge 循环切换权限档', async () => {
  await page.getByTestId('perm-badge').click(); // full-access → auto
  await expect(page.getByTestId('perm-badge')).toHaveAttribute('data-mode', 'auto');
});
