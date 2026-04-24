import { ipcMain } from 'electron'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { IPC } from '../../src/lib/ipc-types'
import log from '../main/logger'
import { getListingHistory, saveListingHistory, deleteListingHistory } from '../db/queries/listing.queries'

function readSettings(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'))
  } catch {
    return {}
  }
}

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
          try {
            const parsed = JSON.parse(data)
            // FastAPI error responses use {"detail": "..."} — normalise to {error}
            if (res.statusCode && res.statusCode >= 400) {
              const raw: string = parsed.detail || parsed.message || data
              // Extract the human-readable message from Claude API error strings
              const clean = raw.match(/'message':\s*'([^']+)'/)?.[1] ?? raw
              reject(new Error(clean))
            } else {
              resolve(parsed)
            }
          }
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

  // ── eBay Listing Generator (multi-provider AI) ───────────────────────────

  ipcMain.handle(IPC.LISTING_IDENTIFY_SET, async (_e, imageB64: string, mediaType = 'image/jpeg', themeHint = '', contextHint = '') => {
    const settings = readSettings()
    const provider = settings.aiProvider ?? 'openai'
    const model    = settings.aiModel    ?? 'gpt-4o-mini'
    const apiKey   = provider === 'anthropic'
      ? (settings.anthropicApiKey ?? '')
      : (settings.openaiApiKey    ?? '')
    if (!apiKey) return { error: `${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key not configured — add it in Settings` }
    try {
      return await sidecarPost('/listing/identify', { image_b64: imageB64, media_type: mediaType, api_key: apiKey, provider, model, theme_hint: themeHint, context_hint: contextHint })
    } catch (err) {
      log.error('[Listing] identifySet failed:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.LISTING_GENERATE, async (_e, setData: unknown, prefs: unknown) => {
    const settings = readSettings()
    const provider = settings.aiProvider ?? 'openai'
    const model    = settings.aiModel    ?? 'gpt-4o-mini'
    const apiKey   = provider === 'anthropic'
      ? (settings.anthropicApiKey ?? '')
      : (settings.openaiApiKey    ?? '')
    if (!apiKey) return { error: `${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key not configured — add it in Settings` }
    try {
      const result = await sidecarPost('/listing/generate', { set_data: setData, prefs, api_key: apiKey, provider, model }) as Record<string, unknown>
      // Auto-save to history
      const sd = setData as { set_number?: string; name?: string; year?: number }
      if (result.title && sd.set_number) {
        try {
          saveListingHistory({
            set_number: String(sd.set_number),
            set_name: String(sd.name ?? ''),
            year: sd.year ?? null,
            title: String(result.title),
            description: String(result.description ?? ''),
            provider,
          })
        } catch (e) { log.warn('[Listing] history save failed:', e) }
      }
      return result
    } catch (err) {
      log.error('[Listing] generate failed:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.LISTING_HISTORY_LIST,   () => getListingHistory())
  ipcMain.handle(IPC.LISTING_HISTORY_DELETE, (_e, id: number) => deleteListingHistory(id))

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
