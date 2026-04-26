import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
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

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  // Apply staged asar on quit — works because app.asar is opened with shared flags on Windows
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

  // ── electron-updater: detection only, no download ──────────────────────────
  autoUpdater.logger = log
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    log.info('[updater] Update available:', info.version)
    // Construct app.asar download URL from the release tag
    const downloadUrl = `https://github.com/${REPO}/releases/download/v${info.version}/app.asar`
    state = { status: 'available', version: info.version, downloadUrl }
    mainWindow.webContents.send(IPC.PUSH_UPDATE_AVAILABLE, { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] Already up to date')
    if (state.status === 'idle') state = { status: 'idle' }
  })

  autoUpdater.on('error', (err) => {
    log.error('[updater] Check error:', err)
    if (state.status === 'idle') {
      mainWindow.webContents.send(IPC.PUSH_UPDATE_ERROR, { message: err.message })
    }
  })

  // ── IPC handlers ───────────────────────────────────────────────────────────

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
      const result = await autoUpdater.checkForUpdates()
      if (!result?.updateInfo) return { upToDate: true }
      if (result.updateInfo.version === app.getVersion()) return { upToDate: true }
      // update-available event will fire and set state
      return { upToDate: false, version: result.updateInfo.version }
    } catch (err) {
      log.warn('[updater] Manual check failed:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.UPDATE_GET_STATE, () => state)

  // Startup check — silent
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => log.warn('[updater] Startup check failed:', err))
  }, 5_000)
}
