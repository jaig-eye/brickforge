/**
 * Updates from GitHub Releases through electron-updater's standard installer
 * flow: the installer's SHA-512 (from latest.yml) is verified before it runs,
 * and nothing downloads until you click Download. Packaged builds only.
 *
 * macOS builds aren't signed with an Apple Developer ID, and macOS won't let
 * an unsigned app replace itself. There the check reads the latest release
 * from GitHub and Download opens its page instead.
 */
import { app, shell } from 'electron'
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

const RELEASES = 'https://github.com/jaig-eye/brickforge/releases'
const manual = process.platform === 'darwin'

/** Is version a newer than b? Plain x.y.z; anything after a "-" is ignored. */
export function isNewer(a: string, b: string): boolean {
  const parts = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

async function checkManually(): Promise<void> {
  set({ status: 'checking' })
  try {
    const res = await fetch(`${process.env.BRICKFORGE_GITHUB_URL ?? 'https://api.github.com'}/repos/jaig-eye/brickforge/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `BrickForge/${app.getVersion()}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const latest = await res.json() as { tag_name?: string; body?: string; html_url?: string }
    const version = (latest.tag_name ?? '').replace(/^v/, '')
    if (version && isNewer(version, app.getVersion())) {
      set({ status: 'available', version, notes: latest.body?.slice(0, 2000) ?? null, url: latest.html_url ?? `${RELEASES}/latest` })
    } else {
      set({ status: 'up-to-date', checkedAt: new Date().toISOString() })
    }
  } catch (err) {
    log.warn('[updater]', err)
    set({ status: 'error', message: "Couldn't check for updates. Try again later." })
  }
}

export function setupUpdater(): void {
  if (!app.isPackaged) return
  if (manual) {
    setTimeout(() => { void checkManually() }, 10_000)
    return
  }
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
  if (manual) { await checkManually(); return state }
  try { await autoUpdater.checkForUpdates() } catch { /* the error event reports it */ }
  return state
}

export async function downloadUpdate(): Promise<void> {
  if (state.status !== 'available') return
  if (state.url) { void shell.openExternal(state.url); return }
  set({ status: 'downloading', version: state.version, percent: 0 })
  try { await autoUpdater.downloadUpdate() } catch { /* the error event reports it */ }
}

export function installUpdate(): void {
  if (state.status === 'ready') autoUpdater.quitAndInstall(false, true)
}
