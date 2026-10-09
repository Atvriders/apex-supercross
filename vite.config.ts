import { defineConfig } from 'vitest/config';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: './',
  plugins: [
    viteStaticCopy({
      targets: [{ src: 'assets/**/*', dest: 'assets' }],
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
