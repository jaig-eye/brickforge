/**
 * Updates from GitHub Releases through electron-updater's standard installer
 * flow: the installer's SHA-512 (from latest.yml) is verified before it runs,
 * and nothing downloads until you click Download. Packaged builds only.
 */
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../../src/lib/ipc-types'
import type { UpdateState } from '../../src/lib/types'
import log from '../main/logger'
import { push } from './notify'

let state: UpdateState = app.isPackaged ? { status: 'idle' } : { status: 'unsupported' }

function set(next: UpdateState): void {
  state = next
  push(IPC.PUSH_UPDATE, state)
}

export const updateState = (): UpdateState => state

export function setupUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.logger = log
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ status: 'up-to-date', checkedAt: new Date().toISOString() }))
  autoUpdater.on('update-available', (info) => set({
    status: 'available',
    version: info.version,
    notes: typeof info.releaseNotes === 'string' ? info.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 2000) : null,
  }))
  autoUpdater.on('download-progress', (p) => {
    if (state.status === 'downloading' || state.status === 'available') {
      set({ status: 'downloading', version: 'version' in state ? state.version : '', percent: Math.round(p.percent) })
    }
  })
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => {
    log.warn('[updater]', err)
    set({ status: 'error', message: 'Couldn\'t check for updates. Try again later.' })
  })

  setTimeout(() => { void checkForUpdates() }, 10_000)
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) return state
  try { await autoUpdater.checkForUpdates() } catch { /* the error event reports it */ }
  return state
}

export async function downloadUpdate(): Promise<void> {
  if (state.status !== 'available') return
  set({ status: 'downloading', version: state.version, percent: 0 })
  try { await autoUpdater.downloadUpdate() } catch { /* the error event reports it */ }
}

export function installUpdate(): void {
  if (state.status === 'ready') autoUpdater.quitAndInstall(false, true)
}
