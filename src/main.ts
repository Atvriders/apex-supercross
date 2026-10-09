/** Entry point. */

import { GameApp } from './game/app';
import './style.css';

// Build marker: bumping this line rotates the bundle hash, which invalidates
// any stale CDN/browser cache entry for the previous JS filename.
const BUILD_TAG = '2026-10-09-r3-mime-fix';
console.info('APEX SUPERCROSS build:', BUILD_TAG);

function showLoadError(msg: string) {
  const text = document.getElementById('loading-text');
  if (text) text.textContent = 'ERROR: ' + msg;
}

window.addEventListener('error', (e) => showLoadError(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) =>
  showLoadError(String((e.reason as Error)?.message ?? e.reason)),
);

const canvas = document.getElementById('game') as HTMLCanvasElement;
let app: GameApp;
try {
  app = new GameApp(canvas);
  app.boot().catch((e) => showLoadError(String(e)));
  (window as unknown as { app: GameApp }).app = app;
} catch (e) {
  showLoadError(String(e));
}
