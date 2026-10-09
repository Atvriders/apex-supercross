import { test } from '@playwright/test';

test('debug boot errors', async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.stack?.split('\n').slice(0, 5).join('\n') ?? String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300));
  });
  await page.goto('/');
  await page.waitForTimeout(60000);
  const state = await page.evaluate(() => document.getElementById('loading-text')?.textContent);
  console.log('LOADING TEXT:', state);
});
