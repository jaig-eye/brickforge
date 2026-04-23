import { ipcMain } from 'electron'
import http from 'http'
import { IPC } from '../../src/lib/ipc-types'
import log from '../main/logger'

const SIDECAR_PORT = parseInt(process.env.BF_SIDECAR_PORT ?? '8741', 10)
const BASE_URL = `http://127.0.0.1:${SIDECAR_PORT}/api/v1`

async function sidecarPost(path: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = http.request(
      `${BASE_URL}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch { reject(new Error(`Invalid JSON from sidecar: ${data}`)) }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Sidecar request timeout')) })
    req.write(payload)
    req.end()
  })
}

export function registerAiHandlers(): void {
  ipcMain.handle(IPC.AI_PICTURE_LOOKUP, async (_e, imageB64: string) => {
    try {
      return await sidecarPost('/picture-lookup', { image_b64: imageB64 })
    } catch (err) {
      log.error('[AI] pictureLookup failed:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.AI_PIECE_IDENTIFY, async (_e, imageB64: string) => {
    try {
      return await sidecarPost('/piece-identify', { image_b64: imageB64 })
    } catch (err) {
      log.error('[AI] pieceIdentify failed:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.AI_BUILDER_GENERATE, async (_e, prompt: string, opts: unknown) => {
    try {
      return await sidecarPost('/builder/generate', { prompt, opts })
    } catch (err) {
      log.error('[AI] builderGenerate failed:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.SIDECAR_STATUS, () => {
    // Dynamically import to avoid circular dep
    const { getSidecarStatus } = require('../main/sidecar')
    return getSidecarStatus()
  })

  ipcMain.handle(IPC.SIDECAR_RESTART, async () => {
    const { BrowserWindow } = require('electron')
    const { startSidecar, stopSidecar } = require('../main/sidecar')
    stopSidecar()
    const win = BrowserWindow.getAllWindows()[0]
    if (win) await startSidecar(win)
  })
}
