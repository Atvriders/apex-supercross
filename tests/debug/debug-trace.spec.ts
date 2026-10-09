import { test } from '@playwright/test';

test('debug y trace', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 240000 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('#menu');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#trackselect');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#vehicleselect');
  await page.getByRole('button', { name: 'START RACE' }).click();
  await page.waitForSelector('#hud', { timeout: 60000 });
  await page.evaluate(() => {
    const app = (window as any).app;
    (window as any).trace = [];
    const orig = app.race.step.bind(app.race);
    app.race.step = (dt: number, input: any) => {
      orig(dt, input);
      const p = app.race.player.state;
      (window as any).trace.push([app.race.phase, +p.pos.y.toFixed(2), +p.vel.y.toFixed(2), p.crashed ? 1 : 0]);
    };
  });
  await page.waitForFunction(() => (window as any).app.race.phase === 'racing', null, { timeout: 240000 });
  const trace = await page.evaluate(() => (window as any).trace.filter((_: unknown, i: number) => i % 20 === 0));
  console.log('TRACE:', JSON.stringify(trace.slice(0, 60)));
});
