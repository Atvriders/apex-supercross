import { test } from '@playwright/test';

test('debug race visuals', async ({ page }) => {
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
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const app = (window as any).app;
    const cam = app.renderer.camera;
    const p = app.race.player.state;
    const scene = app.renderer.scene;
    return [
      'cam=' + cam.position.x.toFixed(1) + ',' + cam.position.y.toFixed(1) + ',' + cam.position.z.toFixed(1),
      'ppos=' + p.pos.x.toFixed(1) + ',' + p.pos.y.toFixed(1) + ',' + p.pos.z.toFixed(1),
      'lookTarget=' + app.cameras ? 'n/a' : 'n/a',
      'children=' + scene.children.length,
      'stadiumChildren=' + app.stadium.root.children.length,
      'playerVeh=' + !!app.playerVehicle,
      'camMode=' + app.cameras.mode,
    ].join(' | ');
  });
  console.log('INFO:', info);
  await page.screenshot({ path: 'test-results/race-debug.png' });
});
