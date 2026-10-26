import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests drive the real, built Electron app (npm run build first —
 * `npm run test:e2e` does it) against the local fake API server, each test in
 * a fresh data folder.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  outputDir: 'test-results',
})
