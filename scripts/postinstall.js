const { execSync } = require('child_process')
const path = require('path')

// Only rebuild native modules when running in the project root
if (!process.env.npm_config_global) {
  console.log('[BrickForge] Rebuilding native modules for Electron…')
  try {
    execSync(
      'node node_modules/@electron/rebuild/bin/electron-rebuild.js --module-dir . --modules better-sqlite3',
      { stdio: 'inherit', cwd: path.resolve(__dirname, '..') }
    )
    console.log('[BrickForge] Native rebuild complete.')
  } catch (e) {
    console.warn('[BrickForge] Native rebuild failed — better-sqlite3 may not work until rebuilt.')
    console.warn('  Run: npx @electron/rebuild --modules better-sqlite3')
  }
}
