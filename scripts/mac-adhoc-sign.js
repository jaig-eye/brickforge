/**
 * electron-builder afterPack hook. With no Apple Developer ID the macOS app
 * is left unsigned, and Apple Silicon Macs refuse to open an app whose
 * signature is missing or broken ("BrickForge is damaged"). An ad-hoc
 * signature fixes that; macOS then asks once before opening an app from an
 * unidentified developer.
 */
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' })
}
