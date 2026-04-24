import { ipcMain, app, safeStorage, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { IPC } from '../../src/lib/ipc-types'
import { getAllFlags, setFlag } from '../db/queries/flags.queries'

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

interface AppSettings {
  sidecarPort: number
  aiProvider?: 'openai' | 'anthropic'
  aiModel?: string
  rebrickableApiKey?: string
  bricklinkConsumerKey?: string
  bricklinkConsumerSecret?: string
  bricklinkToken?: string
  bricklinkTokenSecret?: string
  openaiApiKey?: string
  anthropicApiKey?: string
}

function readSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return { sidecarPort: 8741 }
  }
}

function writeSettings(settings: AppSettings): void {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => readSettings())

  ipcMain.handle(IPC.SETTINGS_SET, (_e, patch: Partial<AppSettings>) => {
    const current = readSettings()
    writeSettings({ ...current, ...patch })
  })

  ipcMain.handle(IPC.FLAGS_GET_ALL, () => getAllFlags())

  ipcMain.handle(IPC.FLAGS_SET, (_e, key: string, enabled: 0 | 1) => setFlag(key, enabled))

  ipcMain.handle(IPC.APP_VERSION, () => app.getVersion())

  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, (_e, url: string) => shell.openExternal(url))

  ipcMain.handle(IPC.APP_SHOW_SAVE_DIALOG, async (_e, opts) => {
    const { dialog } = require('electron')
    const result = await dialog.showSaveDialog(opts)
    return result.canceled ? null : result.filePath
  })
}
