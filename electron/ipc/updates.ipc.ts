import { app, ipcMain, BrowserWindow } from 'electron'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { IPC } from '../../src/lib/ipc-types'
import log from '../main/logger'

const REPO        = 'jaig-eye/brickforge'
const ASAR_UPDATE = path.join(process.resourcesPath, 'app.asar.update')
const ASAR_TARGET = path.join(process.resourcesPath, 'app.asar')

type UpdaterState =
  | { status: 'idle' }
  | { status: 'available'; version: string; downloadUrl: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

let state: UpdaterState = { status: 'idle' }

/** Returns true if semver string a is strictly greater than b. Handles pre-release (alpha.N). */
function semverGt(a: string, b: string): boolean {
  const parse = (v: string) => {
    const [core, pre] = v.split('-')
    const [major, minor, patch] = core.split('.').map(Number)
    const preParts = pre ? pre.split('.').map(p => isNaN(Number(p)) ? p : Number(p)) : null
    return { major, minor, patch, preParts }
  }
  const av = parse(a), bv = parse(b)
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (av[k] !== bv[k]) return av[k] > bv[k]
  }
  if (!av.preParts && bv.preParts)  return true   // stable > pre-release
  if (av.preParts  && !bv.preParts) return false   // pre-release < stable
  if (!av.preParts && !bv.preParts) return false
  const [ap, bp] = [av.preParts!, bv.preParts!]
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    if (ap[i] === undefined) return false
    if (bp[i] === undefined) return true
    if (ap[i] !== bp[i]) {
      if (typeof ap[i] === 'number' && typeof bp[i] === 'number') return (ap[i] as number) > (bp[i] as number)
      return String(ap[i]) > String(bp[i])
    }
  }
  return false
}

function getJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'BrickForge-Updater', Accept: 'application/vnd.github.v3+json' } },
      (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          resolve(getJson(res.headers.location))
          return
        }
        let data = ''
        res.on('data', c => (data += c))
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
      },
    )
    req.on('error', reject)
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Update check timed out')) })
    req.end()
  })
}

function downloadFile(url: string, dest: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (u: string) => {
      https.get(u, { headers: { 'User-Agent': 'BrickForge-Updater' } }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          follow(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`))
          return
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let received = 0
        const out = fs.createWriteStream(dest)
        res.on('data', chunk => {
          received += chunk.length
          if (total > 0) onProgress(Math.round(received / total * 100))
        })
        res.pipe(out)
        out.on('finish', () => { out.close(); resolve() })
        out.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
    }
    follow(url)
  })
}

async function checkGitHub(): Promise<{ version: string; downloadUrl: string } | null> {
  const release = await getJson(`https://api.github.com/repos/${REPO}/releases/latest`) as {
    tag_name: string
    assets: { name: string; browser_download_url: string }[]
  }
  const tagVersion = release.tag_name.replace(/^v/, '')
  if (!semverGt(tagVersion, app.getVersion())) return null
  const asset = release.assets.find(a => a.name === 'app.asar')
  if (!asset) return null
  return { version: tagVersion, downloadUrl: asset.browser_download_url }
}

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // On quit: atomically apply any staged update (safe — app.asar opened with Windows shared flags)
  app.on('will-quit', () => {
    if (!fs.existsSync(ASAR_UPDATE)) return
    try {
      fs.copyFileSync(ASAR_UPDATE, ASAR_TARGET)
      fs.unlinkSync(ASAR_UPDATE)
      log.info('[updater] app.asar updated on quit')
    } catch (err) {
      log.error('[updater] Failed to apply update on quit:', err)
    }
  })

  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    app.relaunch()
    app.quit()
  })

  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => {
    if (state.status === 'downloading') return { ok: true }
    if (state.status === 'ready')       return { ok: true }
    if (state.status !== 'available')   return { error: 'No update available' }

    const { version, downloadUrl } = state
    state = { status: 'downloading', version, percent: 0 }

    try {
      await downloadFile(downloadUrl, ASAR_UPDATE, (pct) => {
        if (state.status === 'downloading') {
          state = { ...state, percent: pct }
          mainWindow.webContents.send(IPC.PUSH_UPDATE_PROGRESS, { percent: pct })
        }
      })
      state = { status: 'ready', version }
      mainWindow.webContents.send(IPC.PUSH_UPDATE_DOWNLOADED, { version })
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      state = { status: 'error', message }
      mainWindow.webContents.send(IPC.PUSH_UPDATE_ERROR, { message })
      try { fs.unlinkSync(ASAR_UPDATE) } catch {}
      return { error: message }
    }
  })

  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    if (state.status === 'available')   return { available: true,   version: state.version }
    if (state.status === 'downloading') return { downloading: true, version: state.version, percent: state.percent }
    if (state.status === 'ready')       return { ready: true,       version: state.version }
    try {
      const found = await checkGitHub()
      if (!found) return { upToDate: true }
      state = { status: 'available', ...found }
      return { available: true, version: found.version }
    } catch (err) {
      log.warn('[updater] Manual check failed:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.UPDATE_GET_STATE, () => state)

  // Startup check — silent, no auto-download
  setTimeout(async () => {
    try {
      const found = await checkGitHub()
      if (!found) return
      state = { status: 'available', ...found }
      mainWindow.webContents.send(IPC.PUSH_UPDATE_AVAILABLE, { version: found.version })
    } catch (err) {
      log.warn('[updater] Startup check failed:', err)
    }
  }, 5_000)
}
