import { test } from '@playwright/test';

test('debug driving', async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
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
  // wait (in app time) for countdown + gate drop
  await page.waitForFunction(() => (window as any).app.race.phase === 'racing', null, { timeout: 240000 });
  const before = await page.evaluate(() => {
    const p = (window as any).app.race.player.state;
    return [p.pos.x, p.pos.y, p.pos.z, p.speed, p.yaw].map((v: number) => v.toFixed(1));
  });
  console.log('BEFORE:', before.join(','));
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(15000);
    const s = await page.evaluate(() => {
      const app = (window as any).app;
      const p = app.race.player.state;
      return {
        phase: app.race.phase, throttle: p.throttle, speed: +p.speed.toFixed(1),
        rpm: Math.round(p.rpm), gear: p.gear, crashed: p.crashed,
        pos: p.pos.z.toFixed(1),
      };
    });
    console.log('S:', JSON.stringify(s));
  }
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => {
    const app = (window as any).app;
    const p = app.race.player.state;
    const lp = app.race.player.lap;
    return [p.pos.x, p.pos.y, p.pos.z, p.speed, p.yaw, lp.s, lp.lap].map((v: number) => v.toFixed(1));
  });
  console.log('AFTER:', after.join(','));
  await page.screenshot({ path: 'test-results/race-drive.png' });
});
