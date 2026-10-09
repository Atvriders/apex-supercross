import { defineConfig } from '@playwright/test';

/** Runs the same tests against the production build (dist/) on :8080. */
export default defineConfig({
  testDir: './tests',
  timeout: 240_000,
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-gpu-sandbox',
      ],
    },
  },
  reporter: [['list']],
});
