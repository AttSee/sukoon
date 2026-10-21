import { defineConfig } from '@playwright/test';
import { TEST_PAGE, TEST_PORT } from './e2e/server';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // The tests wait on real timing (settings round-trips, adapter passes); one retry absorbs a slow CI runner.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  webServer: {
    command: `node bench/serve.ts ${TEST_PORT}`,
    url: TEST_PAGE,
    reuseExistingServer: false,
  },
});
