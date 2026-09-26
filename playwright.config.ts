import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // The tests wait on real timing (settings round-trips, adapter passes); one retry absorbs a slow CI runner.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  webServer: {
    command: 'node bench/serve.ts 4173',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
  },
});
