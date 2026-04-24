import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../../src/lib/ipc-types'
import log from '../main/logger'

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    log.info('[updater] Update available:', info.version)
    mainWindow.webContents.send(IPC.PUSH_UPDATE_AVAILABLE, { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] Already up to date')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send(IPC.PUSH_UPDATE_PROGRESS, {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[updater] Update downloaded:', info.version)
    mainWindow.webContents.send(IPC.PUSH_UPDATE_DOWNLOADED, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log.error('[updater] Error:', err)
  })

  // Renderer triggers install-and-restart
  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    autoUpdater.quitAndInstall()
  })

  // Manual check triggered from Settings — compare versions to detect "up to date" correctly
  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.updateInfo) return { upToDate: true }
      const available = result.updateInfo.version
      const current = app.getVersion()
      if (available === current) return { upToDate: true }
      return { upToDate: false, version: available }
    } catch (err) {
      log.warn('[updater] Manual check failed:', err)
      return { error: String(err) }
    }
  })

  // Check for updates a few seconds after startup (non-blocking)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => log.warn('[updater] Startup check failed:', err))
  }, 5000)
}
