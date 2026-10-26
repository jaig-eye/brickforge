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
    'renderer/**/*',
    'dist-electron/**/*',
    '!dist-electron/**/*.map',
    'resources/icon.png',
    'package.json',
    // Only the main process's packages ship (the interface is bundled by Vite),
    // and of better-sqlite3 only the Windows x64 binary
    '!**/*.map',
    '!**/node_modules/better-sqlite3/{deps,src}/**',
    '!**/node_modules/better-sqlite3/prebuilds/{darwin,linux,linuxmusl}-*',
    '!**/node_modules/better-sqlite3/prebuilds/win32-arm64.node',
  ],
  // The sample collection for demo mode, readable at process.resourcesPath/demo
  extraResources: [{ from: 'resources/demo', to: 'demo' }],

  // better-sqlite3 13 ships prebuilt N-API binaries that work in any Electron
  npmRebuild: false,
  asarUnpack: ['**/*.node'],

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/icon.ico',
    signAndEditExecutable: true,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    runAfterFinish: true,
    shortcutName: 'BrickForge',
    createDesktopShortcut: 'always',
    artifactName: 'BrickForge-Setup-${version}.${ext}',
  },


  publish: {
    provider: 'github',
    owner: 'jaig-eye',
    repo: 'brickforge',
    releaseType: 'release',
  },
}
