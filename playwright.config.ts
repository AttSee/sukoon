import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: 'node bench/serve.ts 4173',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
  },
});
