/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.jaig-eye.brickforge',
  productName: 'BrickForge',
  copyright: 'Copyright © 2026 jaig-eye',

  directories: {
    output: 'dist-electron',
    buildResources: 'resources',
  },

  files: [
    'dist/**/*',
    'dist-electron/main/**/*',
    'dist-electron/ipc/**/*',
    'dist-electron/db/**/*',
    'dist-electron/api/**/*',
    'dist-electron/preload/**/*',
    'resources/**/*',
    'node_modules/**/*',
    '!node_modules/**/{CHANGELOG.md,README.md,readme.md,.editorconfig}',
    '!node_modules/**/{test,__tests__,tests,powered-test,example,examples}/**',
  ],

  extraResources: [
    {
      from: 'sidecar/dist/',
      to: 'sidecar/',
      filter: ['**/*'],
    },
  ],

  nativeRebuilder: 'sequential',
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/icon.ico',
    signAndEditExecutable: false,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'resources/icon.ico',
    shortcutName: 'BrickForge',
  },

  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    icon: 'resources/icon.icns',
    category: 'public.app-category.lifestyle',
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },

  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    icon: 'resources/icon.png',
    category: 'Utility',
  },

  publish: {
    provider: 'github',
    owner: 'jaig-eye',
    repo: 'brickforge',
    releaseType: 'draft',
  },
}
