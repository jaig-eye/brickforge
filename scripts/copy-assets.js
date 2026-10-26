/**
 * Copies non-TypeScript assets (SQL migrations, etc.) to dist-electron
 * after tsc compiles the TypeScript sources.
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// Copy SQL migrations
const srcMigrations = path.join(root, 'electron', 'db', 'migrations')
const destMigrations = path.join(root, 'dist-electron', 'electron', 'db', 'migrations')
copyDir(srcMigrations, destMigrations)
console.log('Assets copied: SQL migrations →', destMigrations)
