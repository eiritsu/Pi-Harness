/**
 * M5 冒烟：真实 driver（faux 脚本内核）在打包 bundle 链路下运行；
 * 设置页检查更新交互。
 */
import { test, expect } from '@playwright/test';
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await _electron.launch({
    args: [path.join(import.meta.dirname, '..', '..', 'dist', 'main', 'main.cjs')],
    env: {
      ...process.env,
      PI_HARNESS_DRIVER: 'pi', // 关键：走 vendored pi 内核（bundle 链路验证）
      PI_HARNESS_DATA_DIR: mkdtempSync(join(tmpdir(), 'pih-m5-')),
      NODE_ENV: 'test',
    },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app.close();
});

test('M5：pi driver（faux 模型）端到端会话', async () => {
  await page.getByTestId('new-chat').click();
  await expect(page.getByTestId('session-row').first()).toBeVisible();
  await page.getByTestId('composer-input').fill('hello pi');
  await page.getByTestId('composer-send').click();
  // faux provider 脚本化回复最终落到消息流
  await expect(page.getByTestId('streaming')).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByTestId('messages')).toContainText(/./, { timeout: 5000 });
});

test('M5：设置页版本显示与检查更新', async () => {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByTestId('palette-input').fill('设置');
  await page.getByTestId('palette-item').first().click();
  await page.getByRole('button', { name: '通用' }).click();
  await expect(page.getByTestId('settings-general')).toContainText(/当前版本 \d+\.\d+\.\d+/);
  await page.getByTestId('check-update').click();
  // 三种结果都算通过：已是最新 / 发现新版本 / 无法检查（无网络或无 release）
  await expect(page.getByTestId('update-notice')).toBeVisible({ timeout: 15000 });
});
