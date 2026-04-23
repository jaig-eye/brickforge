import { app, BrowserWindow } from 'electron'
import { ChildProcess, spawn } from 'child_process'
import path from 'path'
import http from 'http'
import log from './logger'

const SIDECAR_PORT = parseInt(process.env.BF_SIDECAR_PORT ?? '8741', 10)
const HEALTH_INTERVAL_MS = 500
const HEALTH_TIMEOUT_MS = 30_000
const MAX_RESTARTS = 3

let sidecarProcess: ChildProcess | null = null
let restartCount = 0
let stopping = false

function getSidecarPath(): string {
  if (app.isPackaged) {
    const ext = process.platform === 'win32' ? '.exe' : ''
    return path.join(process.resourcesPath, 'sidecar', `brickforge-sidecar${ext}`)
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

function getSidecarArgs(): string[] {
  if (app.isPackaged) return []
  return [path.join(__dirname, '../../sidecar/main.py')]
}

function pollHealth(): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS
    const check = () => {
      if (Date.now() > deadline) {
        return reject(new Error('Sidecar health timeout after 30s'))
      }
      const req = http.get(`http://127.0.0.1:${SIDECAR_PORT}/health`, (res) => {
        if (res.statusCode === 200) resolve()
        else setTimeout(check, HEALTH_INTERVAL_MS)
      })
      req.on('error', () => setTimeout(check, HEALTH_INTERVAL_MS))
      req.setTimeout(400, () => { req.destroy(); setTimeout(check, HEALTH_INTERVAL_MS) })
    }
    check()
  })
}

export async function startSidecar(mainWindow: BrowserWindow): Promise<void> {
  stopping = false
  const bin = getSidecarPath()
  const args = getSidecarArgs()

  log.info(`[sidecar] Spawning: ${bin} ${args.join(' ')}`)

  sidecarProcess = spawn(bin, args, {
    env: {
      ...process.env,
      BF_SIDECAR_PORT: String(SIDECAR_PORT),
      BF_ENV: process.env.NODE_ENV ?? 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  sidecarProcess.stdout?.on('data', (d) => log.debug('[sidecar]', d.toString().trim()))
  sidecarProcess.stderr?.on('data', (d) => log.warn('[sidecar stderr]', d.toString().trim()))

  sidecarProcess.on('exit', (code, signal) => {
    if (stopping) return
    log.warn(`[sidecar] Exited (code=${code}, signal=${signal})`)
    if (restartCount < MAX_RESTARTS) {
      restartCount++
      log.info(`[sidecar] Restarting (attempt ${restartCount}/${MAX_RESTARTS})…`)
      setTimeout(() => startSidecar(mainWindow), 1000)
    } else {
      log.error('[sidecar] Max restarts reached — AI features disabled')
      mainWindow.webContents.send('bf:push:sidecarDown')
    }
  })

  try {
    await pollHealth()
    restartCount = 0
    log.info('[sidecar] Ready on port', SIDECAR_PORT)
    mainWindow.webContents.send('bf:push:sidecarReady', { port: SIDECAR_PORT })
  } catch (err) {
    log.error('[sidecar] Failed to come up:', err)
    mainWindow.webContents.send('bf:push:sidecarDown')
  }
}

export function stopSidecar(): void {
  stopping = true
  if (sidecarProcess) {
    log.info('[sidecar] Stopping…')
    sidecarProcess.kill('SIGTERM')
    sidecarProcess = null
  }
}

export function getSidecarStatus(): { running: boolean; port: number; restarts: number } {
  return {
    running: sidecarProcess !== null && !sidecarProcess.killed,
    port: SIDECAR_PORT,
    restarts: restartCount,
  }
}
