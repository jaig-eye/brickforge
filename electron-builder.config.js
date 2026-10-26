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
    // and of better-sqlite3 only the binaries for the platform being built
    '!**/*.map',
    '!**/node_modules/better-sqlite3/{deps,src}/**',
    // (only exclusions in a platform's own files list would make it pack everything)
    '!**/node_modules/better-sqlite3/prebuilds/!(${platform}-${arch}).node',
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

  // One DMG each for Apple Silicon and Intel Macs. There's no Apple Developer
  // ID, so electron-builder doesn't sign; the afterPack hook signs ad hoc.
  mac: {
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
    icon: 'resources/icon.png',
    category: 'public.app-category.lifestyle',
    identity: null,
  },
  dmg: {
    artifactName: 'BrickForge-${version}-mac-${arch}.${ext}',
  },
  afterPack: 'scripts/mac-adhoc-sign.js',

  publish: {
    provider: 'github',
    owner: 'jaig-eye',
    repo: 'brickforge',
    releaseType: 'release',
  },
}
