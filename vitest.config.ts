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
    // Hosted CI disks are slow: a test that takes half a second here can take seconds there
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    restoreMocks: true,
  },
})
