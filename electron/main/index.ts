import { isDemo } from './paths' // must run first: it decides where userData lives
import { app, BrowserWindow, session, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import log from './logger'
import { sealPlaintextSecrets } from './settings-store'
import { runMigrations } from '../db/migrate'
import { closeDb } from '../db/index'
import { registerAllHandlers } from '../ipc/index'
import { openExternalSafely } from '../ipc/app.ipc'
import { seedDemoIfEmpty } from '../services/demo'
import { resumeQueue } from '../services/scan-queue'
import { startScheduler, stopScheduler } from '../services/pricing'
import { runStartupMaintenance } from '../services/maintenance'
import { setupUpdater } from '../services/updater'
import { startSync, stopSync } from '../services/sync'

const isDev = !app.isPackaged && process.env.NODE_ENV === 'development'
const DEV_URL = 'http://localhost:5173'
const PRELOAD = path.join(__dirname, '../preload/index.js')

let mainWindow: BrowserWindow | null = null

// ── Window size and position survive restarts ───────────────────────────────

interface Bounds { x?: number; y?: number; width: number; height: number; maximized?: boolean }
const boundsFile = () => path.join(app.getPath('userData'), 'window-state.json')

function loadBounds(): Bounds {
  const fallback = { width: 1360, height: 860 }
  try {
    const b = JSON.parse(fs.readFileSync(boundsFile(), 'utf8')) as Bounds
    // Ignore positions on a monitor that's no longer connected
    const visible = b.x != null && b.y != null && screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return b.x! >= a.x - 50 && b.y! >= a.y - 50 && b.x! < a.x + a.width && b.y! < a.y + a.height
    })
    return { ...fallback, ...b, ...(visible ? {} : { x: undefined, y: undefined }) }
  } catch {
    return fallback
  }
}

function saveBounds(win: BrowserWindow): void {
  try {
    const maximized = win.isMaximized()
    const b = maximized ? win.getNormalBounds() : win.getBounds()
    fs.writeFileSync(boundsFile(), JSON.stringify({ ...b, maximized }))
  } catch { /* cosmetic */ }
}

function createWindow(): BrowserWindow {
  const b = loadBounds()
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    minWidth: 980, minHeight: 640,
    frame: false,
    backgroundColor: '#0A0C12',
    show: false,
    title: isDemo ? 'BrickForge (demo)' : 'BrickForge',
    icon: path.join(__dirname, '../../../resources/icon.png'),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  if (b.maximized) win.maximize()

  if (isDev) void win.loadURL(DEV_URL)
  else void win.loadFile(path.join(__dirname, '../../../renderer/index.html'))
  if (isDev && process.env.BF_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' })

  win.once('ready-to-show', () => win.show())
  win.on('close', () => saveBounds(win))

  // Links leave the app for the browser; the app itself never navigates away
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const current = win.webContents.getURL()
    if (isDev && url.startsWith(DEV_URL) && current.startsWith(DEV_URL)) return // HMR full reload
    e.preventDefault()
    if (/^https?:/i.test(url)) openExternalSafely(url)
  })
  return win
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  if (process.platform === 'win32') app.setAppUserModelId('com.jaig-eye.brickforge')

  app.whenReady().then(async () => {
    log.info(`BrickForge ${app.getVersion()} starting${isDemo ? ' (demo)' : ''}`)

    // The renderer needs no device permissions at all
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
    session.defaultSession.setPermissionCheckHandler(() => false)

    try {
      const sealed = sealPlaintextSecrets()
      if (sealed) log.info(`[settings] encrypted ${sealed} key(s) that were stored in plain text`)
    } catch (err) {
      log.warn('[settings] could not encrypt stored keys:', err)
    }

    try {
      await runMigrations()
      if (isDemo) seedDemoIfEmpty()
    } catch (err) {
      log.error('Database setup failed:', err)
      const { dialog } = await import('electron')
      dialog.showErrorBox('BrickForge could not open your collection',
        `The database could not be prepared. Your data has not been changed, and a backup was taken first.\n\n${err instanceof Error ? err.message : err}\n\nLogs: ${path.join(app.getPath('userData'), 'logs')}`)
      app.quit()
      return
    }

    registerAllHandlers()
    mainWindow = createWindow()

    resumeQueue()
    if (!isDemo) {
      startScheduler()
      runStartupMaintenance()
      setupUpdater()
      startSync()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  }).catch((err) => log.error('Startup failed:', err))

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    stopScheduler()
    stopSync()
  })

  app.on('will-quit', () => {
    try { closeDb() } catch { /* already closed */ }
  })
}
