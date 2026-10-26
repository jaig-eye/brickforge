import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // Main-process code runs under plain Node in tests, against a stand-in
      // for the Electron APIs it uses (see tests/stubs/electron.ts)
      electron: path.resolve(__dirname, 'tests/stubs/electron.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/helpers/setup.ts'],
    testTimeout: 20_000,
    pool: 'forks',
    restoreMocks: true,
  },
})
