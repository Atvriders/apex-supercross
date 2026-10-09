import { test, expect } from '@playwright/test';

test('split screen race runs with two local players', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 240000 });
  await page.keyboard.press('Enter'); // intro -> menu
  await page.waitForSelector('#menu');
  // select Split Screen directly
  await page.getByText('Split Screen', { exact: true }).click();
  await page.waitForSelector('#vehicleselect', { timeout: 30000 });
  await page.getByRole('button', { name: 'START RACE' }).click();
  await page.waitForSelector('#hud', { timeout: 60000 });
  const state = await page.evaluate(() => {
    const app = (window as any).app;
    return {
      mode: app.raceConfig?.mode,
      players: app.race.entries.filter((e: { isPlayer: boolean }) => e.isPlayer).length,
      entries: app.race.entries.length,
      useGamepad: app.input.useGamepad,
      p2Exists: !!app.race.entries[1],
    };
  });
  console.log('SPLIT:', JSON.stringify(state));
  expect(state.mode).toBe('split_screen');
  expect(state.players).toBe(2);
  expect(errors.filter((e) => !e.includes('WebGL'))).toEqual([]);
  await page.screenshot({ path: 'test-results/split.png' });
});
