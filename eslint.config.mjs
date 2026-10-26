import tsPlugin from '@typescript-eslint/eslint-plugin'

export default [
  { ignores: ['dist-electron/**', 'renderer/**', 'release/**', 'node_modules/**', 'test-results/**', 'docs/**', '.claude/**', 'scripts/**', '*.config.js'] },
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true }],
      // Electron's main process loads a couple of optional modules lazily
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]
