const fs = require('fs')
const path = require('path')

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.jaig-eye.brickforge',
  productName: 'BrickForge',
  copyright: 'Copyright © 2026 jaig-eye',

  directories: {
    output: 'release',
    buildResources: 'resources',
  },

  files: [
    // Vite renderer build (separate from electron-builder output dir)
    'renderer/**/*',
    // Compiled Electron main process (tsc rootDir="." → dist-electron/electron/...)
    'dist-electron/electron/**/*',
    // Shared src types compiled by tsconfig.node.json
    'dist-electron/src/**/*',
    // Exclude heavy test/doc files from node_modules
    'node_modules/**/*',
    '!node_modules/**/{CHANGELOG.md,README.md,readme.md,.editorconfig}',
    '!node_modules/**/{test,__tests__,tests,powered-test,example,examples}/**',
    '!node_modules/**/.*',
  ],

  // Only bundle the sidecar if it has been built
  ...(fs.existsSync(path.join(__dirname, 'sidecar', 'dist')) ? {
    extraResources: [{
      from: 'sidecar/dist/',
      to: 'sidecar/',
      filter: ['**/*'],
    }],
  } : {}),

  nativeRebuilder: 'sequential',
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    signAndEditExecutable: false,
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'BrickForge',
    createDesktopShortcut: 'always',
  },

  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    category: 'public.app-category.lifestyle',
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },

  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    category: 'Utility',
  },

  publish: {
    provider: 'github',
    owner: 'jaig-eye',
    repo: 'brickforge',
    releaseType: 'release',
  },
}
