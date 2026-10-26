import { app, ipcMain, shell, BrowserWindow } from 'electron'
import { IPC } from '../../src/lib/ipc-types'
import type { AppInfo } from '../../src/lib/types'
import { isDemo } from '../main/paths'
import { updateState, checkForUpdates, downloadUpdate, installUpdate } from '../services/updater'
import { syncStatus, connectSync, syncNow, disconnectSync } from '../services/sync'
import { handle, str } from './handle'

const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

/** Open a link in the user's browser — web and mail links only. */
export function openExternalSafely(url: string): void {
  try {
    const parsed = new URL(url)
    if (EXTERNAL_PROTOCOLS.has(parsed.protocol)) void shell.openExternal(parsed.toString())
  } catch { /* not a URL */ }
}

function relaunch(args: string[]): void {
  const base = process.argv.slice(1).filter((a) => a !== '--demo')
  app.relaunch({ args: [...base, ...args] })
  app.exit(0)
}

export function registerAppHandlers(): void {
  handle(IPC.APP_INFO, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
    demo: isDemo,
    dataDir: app.getPath('userData'),
  }))
  handle(IPC.APP_OPEN_EXTERNAL, (url: unknown) => openExternalSafely(str(url, 2000)))
  handle(IPC.APP_ENTER_DEMO, () => relaunch(['--demo']))
  handle(IPC.APP_EXIT_DEMO, () => relaunch([]))
  handle(IPC.APP_SHOW_DATA_FOLDER, () => shell.openPath(app.getPath('userData')))

  handle(IPC.UPDATE_STATE, () => updateState())
  handle(IPC.UPDATE_CHECK, () => checkForUpdates())
  handle(IPC.UPDATE_DOWNLOAD, () => downloadUpdate())
  handle(IPC.UPDATE_INSTALL, () => installUpdate())

  handle(IPC.SYNC_STATUS, () => syncStatus())
  handle(IPC.SYNC_CONNECT, (url: unknown) => connectSync(str(url, 2000)))
  handle(IPC.SYNC_NOW, () => syncNow())
  handle(IPC.SYNC_DISCONNECT, () => disconnectSync())

  // Window controls for the frameless title bar
  const win = (e: Electron.IpcMainEvent) => BrowserWindow.fromWebContents(e.sender)
  ipcMain.removeAllListeners(IPC.WIN_MINIMIZE)
  ipcMain.removeAllListeners(IPC.WIN_MAXIMIZE)
  ipcMain.removeAllListeners(IPC.WIN_CLOSE)
  ipcMain.on(IPC.WIN_MINIMIZE, (e) => win(e)?.minimize())
  ipcMain.on(IPC.WIN_MAXIMIZE, (e) => {
    const w = win(e)
    if (w?.isMaximized()) w.unmaximize()
    else w?.maximize()
  })
  ipcMain.on(IPC.WIN_CLOSE, (e) => win(e)?.close())
}
