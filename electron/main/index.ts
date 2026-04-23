import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'path'
import log from './logger'
import { startSidecar, stopSidecar } from './sidecar'
import { runMigrations } from '../db/migrate'
import { registerAllHandlers } from '../ipc/index'

const isDev = process.env.NODE_ENV === 'development'
const PRELOAD_PATH = path.join(__dirname, '../preload/index.js')

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0F0F10',
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../../resources/icon.png'),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
    log.info('BrickForge window ready')
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Window control IPC (for custom titlebar)
  ipcMain.on('bf:window:minimize', () => mainWindow?.minimize())
  ipcMain.on('bf:window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on('bf:window:close', () => mainWindow?.close())

  return mainWindow
}

app.whenReady().then(async () => {
  log.info(`BrickForge ${app.getVersion()} starting…`)

  // Run DB migrations before anything else
  try {
    await runMigrations()
    log.info('DB migrations complete')
  } catch (err) {
    log.error('DB migration failed:', err)
    app.quit()
    return
  }

  const win = createWindow()

  // Register all IPC handlers
  registerAllHandlers()

  // Start Python AI sidecar
  startSidecar(win).catch((err) => log.error('Sidecar start error:', err))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopSidecar()
})

// Security: prevent new window creation except via shell.openExternal
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (e, url) => {
    if (!isDev && !url.startsWith('file://')) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
})
