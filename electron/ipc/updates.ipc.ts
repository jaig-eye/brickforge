import { ipcMain, BrowserWindow } from 'electron'
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

  // Check for updates a few seconds after startup (non-blocking)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => log.warn('[updater] Check failed:', err))
  }, 5000)
}
