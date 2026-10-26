/**
 * Pre-stubs the two macOS symlinks inside the winCodeSign-2.6.0 cache that
 * Windows can't create (requires Developer Mode or admin). Without this,
 * electron-builder's 7z extraction exits with code 2 and fails the build.
 *
 * The actual symlinks (libcrypto.dylib → libcrypto.1.0.0.dylib, etc.) are
 * only needed for macOS code signing — irrelevant on Windows builds.
 */
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const cacheDir  = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign')
const signDir   = path.join(cacheDir, 'winCodeSign-2.6.0')
const stubPaths = [
  path.join(signDir, 'darwin', '10.12', 'lib', 'libcrypto.dylib'),
  path.join(signDir, 'darwin', '10.12', 'lib', 'libssl.dylib'),
]

for (const p of stubPaths) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, '')
    console.log('[prep-codesign-cache] stubbed', path.relative(cacheDir, p))
  }
}
console.log('[prep-codesign-cache] done')
