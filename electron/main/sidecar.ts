import { app, BrowserWindow } from 'electron'
import { ChildProcess, spawn, execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'
import log from './logger'

/** Kill whatever process is holding the given port (handles stale sidecar from previous session). */
function killPortHolder(port: number): void {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' })
      const pid = out.trim().split(/\s+/).pop()
      if (pid && pid !== '0') {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
        log.info(`[sidecar] Killed stale process PID ${pid} on port ${port}`)
      }
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, { shell: '/bin/sh' })
    }
  } catch {
    // Nothing to kill — that's fine
  }
}

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
  return ['-m', 'sidecar.main']
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

  // In production, skip silently if the sidecar binary wasn't bundled.
  if (app.isPackaged && !fs.existsSync(bin)) {
    log.warn('[sidecar] Binary not found — AI features disabled:', bin)
    mainWindow.webContents.send('bf:push:sidecarDown')
    return
  }

  // Always kill whatever is holding the port before spawning. On crash-restart
  // the exited Python process may leave orphaned uvicorn worker processes that
  // still hold the socket, causing EADDRINUSE (10048 on Windows).
  killPortHolder(SIDECAR_PORT)
  // Give Windows time to release the TCP socket before binding again
  await new Promise((r) => setTimeout(r, 600))

  const args = getSidecarArgs()

  log.info(`[sidecar] Spawning: ${bin} ${args.join(' ')}`)

  sidecarProcess = spawn(bin, args, {
    cwd: app.isPackaged ? undefined : app.getAppPath(),
    env: {
      ...process.env,
      BF_SIDECAR_PORT: String(SIDECAR_PORT),
      BF_ENV: process.env.NODE_ENV ?? 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Catch spawn errors (e.g. binary missing at runtime) without crashing the app.
  sidecarProcess.on('error', (err) => {
    log.error('[sidecar] Spawn error:', err)
    mainWindow.webContents.send('bf:push:sidecarDown')
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
