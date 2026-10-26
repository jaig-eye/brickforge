import { defineConfig } from '@playwright/test'

/** `npm run screenshots` — regenerates the README screenshots in docs/screenshots. */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /screenshots\.shot\.ts$/,
  timeout: 240_000,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
})
