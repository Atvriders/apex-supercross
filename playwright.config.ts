import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 240_000,
  use: {
    baseURL: 'http://localhost:5173',
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
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  reporter: [['list']],
});
