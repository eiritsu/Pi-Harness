/**
 * M4 持久化验收：改全局默认权限档 → 落盘 → 重启 → 新会话自动应用。
 * 单文件两段 launch（不走 beforeAll，重启是测试本体）。
 */
import { test, expect } from '@playwright/test';
import { _electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MAIN = path.join(import.meta.dirname, '..', '..', 'dist', 'main', 'main.cjs');

async function launch(dataDir: string): Promise<{ app: ElectronApplication; page: Awaited<ReturnType<ElectronApplication['firstWindow']>> }> {
  const app = await _electron.launch({
    args: [MAIN],
    env: { ...process.env, PI_HARNESS_DRIVER: 'fake', PI_HARNESS_DATA_DIR: dataDir, NODE_ENV: 'test' },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

test('M4 持久化：设置跨重启生效，新会话自动应用默认档', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'pih-persist-'));

  // 第一段：改默认权限档为 full-access
  const first = await launch(dataDir);
  await first.page.keyboard.press('ControlOrMeta+k');
  await first.page.getByTestId('palette-input').fill('设置');
  await first.page.getByTestId('palette-item').first().click();
  await first.page.getByTestId('default-perm-full-access').click();
  // 落盘验证
  const raw = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf-8'));
  expect(raw.agent.defaultPermissionMode).toBe('full-access');
  await first.app.close();

  // 第二段：重启 → 新会话 → badge 即默认档
  const second = await launch(dataDir);
  await second.page.getByTestId('new-chat').click();
  await expect(second.page.getByTestId('perm-badge')).toHaveAttribute('data-mode', 'full-access', { timeout: 5000 });
  await second.app.close();
});
