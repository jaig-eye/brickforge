import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../../src/lib/ipc-types'
import log from '../main/logger'

type UpdaterState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

let state: UpdaterState = { status: 'idle' }

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.logger = log
  autoUpdater.autoDownload = false        // user explicitly triggers download
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    log.info('[updater] Update available:', info.version)
    state = { status: 'available', version: info.version }
    mainWindow.webContents.send(IPC.PUSH_UPDATE_AVAILABLE, { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] Already up to date')
    state = { status: 'idle' }
  })

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent)
    if (state.status === 'downloading') state = { ...state, percent }
    mainWindow.webContents.send(IPC.PUSH_UPDATE_PROGRESS, {
      percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[updater] Update downloaded:', info.version)
    state = { status: 'ready', version: info.version }
    mainWindow.webContents.send(IPC.PUSH_UPDATE_DOWNLOADED, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log.error('[updater] Error:', err)
    const message = err.message
    state = { status: 'error', message }
    mainWindow.webContents.send(IPC.PUSH_UPDATE_ERROR, { message })
  })

  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => {
    if (state.status === 'downloading') return { ok: true }
    if (state.status === 'ready') return { ok: true }
    const version = state.status === 'available' ? state.version : undefined
    if (version) state = { status: 'downloading', version, percent: 0 }
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      return { error: String(err) }
    }
  })

  // Return cached state immediately — avoids re-triggering/restarting the download
  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    if (state.status === 'available')   return { available: true, version: state.version }
    if (state.status === 'downloading') return { downloading: true, version: state.version, percent: state.percent }
    if (state.status === 'ready')       return { ready: true, version: state.version }
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.updateInfo) return { upToDate: true }
      const ver = result.updateInfo.version
      if (ver === app.getVersion()) return { upToDate: true }
      return { upToDate: false, version: ver }
    } catch (err) {
      log.warn('[updater] Manual check failed:', err)
      return { error: String(err) }
    }
  })

  // Settings page calls this on mount to sync with any in-progress state
  ipcMain.handle(IPC.UPDATE_GET_STATE, () => state)

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => log.warn('[updater] Startup check failed:', err))
  }, 5000)
}
