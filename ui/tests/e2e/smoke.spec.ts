import { test, expect } from '@playwright/test';
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await _electron.launch({
    args: [path.join(import.meta.dirname, '..', '..', 'dist', 'main', 'main.cjs')],
    env: {
      ...process.env,
      PI_HARNESS_DRIVER: 'fake',
      NODE_ENV: 'test',
    },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app.close();
});

test('M2 冒烟：三栏布局渲染', async () => {
  await expect(page.getByTestId('sidebar')).toBeVisible();
  await expect(page.getByTestId('thread')).toBeVisible();
  await expect(page.getByTestId('composer')).toBeVisible();
  await expect(page.getByTestId('empty-state')).toBeVisible();
});

test('M2 冒烟：新对话 → 发消息 → 流式回复渲染', async () => {
  await page.getByTestId('new-chat').click();
  await expect(page.getByTestId('session-row').first()).toBeVisible();

  const input = page.getByTestId('composer-input');
  await input.fill('你好');
  await page.getByTestId('composer-send').click();

  // fake driver 会把用户消息回声为 assistant 流式回复
  await expect(page.getByTestId('messages')).toContainText('echo:', { timeout: 5000 });
  // 流结束后 streaming 区消失
  await expect(page.getByTestId('streaming')).toHaveCount(0, { timeout: 5000 });
});
