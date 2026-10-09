import { test, expect } from '@playwright/test';

test('shows a visible error when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error test stub
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
      return (orig as unknown as (t: string, ...a: unknown[]) => unknown).call(this, type, ...args);
    };
  });
  await page.goto('/');
  const text = await page.locator('#loading-text').textContent({ timeout: 60000 });
  console.log('LOADING TEXT:', text);
  expect(text).toContain('WebGL is not available');
});

test('production build boots and plays', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 240000 });
  await expect(page.locator('#intro')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu')).toBeVisible({ timeout: 15000 });
  expect(errors.filter((e) => !e.includes('WebGL'))).toEqual([]);
  await page.screenshot({ path: 'test-results/prod-menu.png' });
});
