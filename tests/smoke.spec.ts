import { test, expect } from '@playwright/test';

test('boots to intro screen without fatal errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  // loading overlay should disappear once assets are ready
  await expect(page.locator('#loading')).toBeHidden({ timeout: 180_000 });
  await expect(page.locator('#intro')).toBeVisible();
  expect(errors.filter((e) => !e.includes('WebGL'))).toEqual([]);
  await page.screenshot({ path: 'test-results/intro.png' });
});

test('navigates to main menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 180_000 });
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'test-results/menu.png' });
});

test('opens track select with animated stadium', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 180_000 });
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu')).toBeVisible();
  await page.keyboard.press('Enter'); // first menu item: Single Event
  await expect(page.locator('#trackselect')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/trackselect.png' });
});

test('vehicle select screen shows vehicle', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 180_000 });
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#trackselect')).toBeVisible();
  await page.keyboard.press('Enter'); // ENTER EVENT
  await expect(page.locator('#vehicleselect')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/vehicleselect.png' });
});

test('starts a race and HUD appears', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 180_000 });
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#trackselect')).toBeVisible();
  await page.keyboard.press('Enter'); // enter event
  await expect(page.locator('#vehicleselect')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'START RACE' }).click(); // start race
  await expect(page.locator('#hud')).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'test-results/race.png' });
});
