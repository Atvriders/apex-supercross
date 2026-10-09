import { test } from '@playwright/test';

test('debug race start', async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300));
  });
  await page.goto('/');
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 240000 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('#menu');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#trackselect');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#vehicleselect');
  console.log('clicking START RACE');
  const btn = page.getByRole('button', { name: 'START RACE' });
  await btn.click({ timeout: 20000 }).catch((e) => console.log('CLICK FAILED:', String(e).slice(0, 200)));
  console.log('after click');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(20000);
    const state = await page.evaluate(() => ({
      hud: !!document.getElementById('hud'),
      screens: [...document.querySelectorAll('.screen')].map((s) => s.id),
    }));
    console.log(`t=${(i + 1) * 20}s`, JSON.stringify(state));
  }
});
