/**
 * AI IPC handlers — calls OpenAI and Anthropic APIs directly from Node.js.
 * No Python sidecar required.
 */
import { ipcMain } from 'electron'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { IPC } from '../../src/lib/ipc-types'
import log from '../main/logger'
import { getListingHistory, saveListingHistory, deleteListingHistory } from '../db/queries/listing.queries'

// ── Settings helper ────────────────────────────────────────────────────────────

function readSettings(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'))
  } catch {
    return {}
  }
}

// ── Low-level HTTPS POST ───────────────────────────────────────────────────────

function httpsPost(
  hostname: string,
  urlPath: string,
  extraHeaders: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = https.request(
      {
        hostname,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...extraHeaders,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (res.statusCode && res.statusCode >= 400) {
              const errObj = (parsed as Record<string, unknown>)?.error
              const msg =
                (typeof errObj === 'object' && errObj !== null ? (errObj as Record<string, unknown>).message : undefined) ??
                (parsed as Record<string, unknown>)?.detail ??
                data
              reject(new Error(String(msg)))
            } else {
              resolve(parsed)
            }
          } catch {
            reject(new Error(`Invalid JSON from AI API: ${data.slice(0, 200)}`))
          }
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(60_000, () => { req.destroy(); reject(new Error('AI request timed out after 60s')) })
    req.write(payload)
    req.end()
  })
}

async function callOpenAI(apiKey: string, body: object): Promise<unknown> {
  return httpsPost('api.openai.com', '/v1/chat/completions', { Authorization: `Bearer ${apiKey}` }, body)
}

async function callAnthropic(apiKey: string, body: object): Promise<unknown> {
  return httpsPost('api.anthropic.com', '/v1/messages', {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }, body)
}

// ── JSON parser (strips markdown fences) ──────────────────────────────────────

function parseAiJson(text: string): unknown {
  const stripped = text.trim()
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  return JSON.parse(fenced ? fenced[1].trim() : stripped)
}

function extractText(result: unknown, provider: string): string {
  if (provider === 'anthropic') {
    return (result as { content: [{ text: string }] }).content[0].text
  }
  return (result as { choices: [{ message: { content: string } }] }).choices[0].message.content
}

// ── Prompts ────────────────────────────────────────────────────────────────────

function buildIdentifyPrompt(themeHint = '', contextHint = ''): string {
  const hints: string[] = []
  if (themeHint)   hints.push(`Theme: '${themeHint}'`)
  if (contextHint) hints.push(`Additional context from seller: "${contextHint}"`)
  const themeLine = hints.length
    ? `Seller hints — use these to narrow your search:\n${hints.map(h => `  • ${h}`).join('\n')}\n\n`
    : ''
  return `You are a world-class LEGO expert and set identifier. Carefully examine the image.

Your goal is to identify the specific LEGO set shown. Analyse these clues in priority order:

1. MINIFIGURES (highest confidence signal)
   - Name every minifigure you can see — their outfit, helmet, face print, accessories
   - Exclusive or rare minifigures appear in only one or very few sets — if you spot one, confidence should be HIGH (0.85+)
   - List which minifigures you identified in the notes field

2. SET NUMBER
   - Printed on the box, instruction booklet cover, or stickers visible in the image

3. DISTINCTIVE BUILD FEATURES
   - Unique shapes, colour schemes, or structural elements specific to one set

4. TEXT / BRANDING
   - Any text, logos, ship names, location names visible in the image

IMPORTANT: Always provide your best guess. Do NOT return empty fields unless the image contains no LEGO content whatsoever.

${themeLine}Return ONLY a valid JSON object — no markdown, no extra text:
{"set_number": "75192", "set_name": "Millennium Falcon", "confidence": 0.85, "notes": "Identified Han Solo and Chewbacca minifigures"}

set_number: official LEGO set number, digits only, no -1 suffix.
set_name: full official name.
confidence: 0.0–1.0.
notes: list which minifigures you spotted and other specific visual clues used.`
}

function buildListingPrompt(setData: Record<string, unknown>, prefs: Record<string, unknown>): string {
  const completeness    = (prefs.completeness as string) ?? 'complete'
  const hasManual       = prefs.includes_instructions !== false
  const hasFigs         = prefs.includes_figures !== false
  const smokeFree       = !!prefs.smoke_free_home
  const cleanSet        = !!prefs.clean_set

  const condToken    = completeness === 'complete' ? 'Complete' : completeness === 'partial' ? '99% Complete' : 'Incomplete'
  const conditionDesc =
    completeness === 'complete'   ? 'Complete — all pieces present and verified' :
    completeness === 'partial'    ? '99% Complete — may be missing a very small number of minor pieces' :
                                    'Incomplete — some pieces are missing'

  const attrs: string[] = []
  if (smokeFree) attrs.push('From a smoke-free home')
  if (cleanSet)  attrs.push('Clean, well-maintained set')
  attrs.push(hasManual ? 'Includes original instruction manual' : 'No instruction manual included')
  attrs.push(hasFigs   ? 'All minifigures included'            : 'Minifigures NOT included')

  const minifigs   = (setData.num_minifigures ?? setData.minifig_count ?? 0) as number
  const pieces     = setData.piece_count ?? setData.num_parts ?? ''
  const year       = setData.year ?? ''
  const theme      = setData.theme ?? ''
  const name       = setData.name ?? ''
  const setNo      = setData.set_number ?? ''

  const manualToken = hasManual ? 'w/ Manual' : 'No Manual'
  const figsToken   = hasFigs ? (minifigs ? `w/ ${minifigs} Minifigs` : 'w/ Figs') : 'No Figs'
  const extraTokens = [cleanSet ? 'Clean' : '', smokeFree ? 'Smoke-Free' : ''].filter(Boolean).join(' ')

  return `You are an expert eBay seller specialising in LEGO sets. Generate a keyword-optimised eBay listing for the set below.

SET DETAILS
Set Number : ${setNo}
Name       : ${name}
Year       : ${year}
Theme      : ${theme || 'LEGO'}
Pieces     : ${pieces}
Minifigs   : ${minifigs || 'Unknown'}

SELLER ATTRIBUTES
${attrs.map(a => `• ${a}`).join('\n')}
Condition  : ${conditionDesc}

OUTPUT FORMAT — return ONLY a JSON object with exactly TWO keys: "title" and "description".

"title" — eBay title rules:
  • HARD LIMIT: 80 characters. NEVER exceed this. eBay rejects longer titles.
  • Goal: pack as close to 80 as possible. Count every character before finalising.
  • Pack keywords in this priority order:
      1. LEGO  2. Theme: ${theme}  3. Set number: ${setNo}  4. Set name: ${name}
      5. Year: ${year}  6. Piece count: ${pieces}pcs  7. Condition: ${condToken}
      8. Manual: ${manualToken}  9. Figures: ${figsToken}  10. Extras: ${extraTokens || '(none)'}
  • Abbreviations: "pcs", "w/", "&", drop articles.
  • Example (74 chars): "LEGO Star Wars 75154 TIE Striker 2016 543pcs Complete w/ Manual & Figs"

"description" — Full eBay description in clean HTML. No shipping/payment info. Structure:
  <h2>About This Set</h2> — 2–3 sentences of enthusiastic retail-style copy
  <h2>Set Details</h2> — HTML table: Set Number | Name | Year | Theme | Piece Count | Minifigures | Condition
  <h2>What's Included</h2> — <ul> of seller attribute bullets

Return ONLY the raw JSON object. No markdown fences. No extra text.`
}

function enforceTitleLimit(result: Record<string, unknown>): Record<string, unknown> {
  const title = (result.title as string) ?? ''
  if (title.length > 80) {
    const truncated = title.slice(0, 80)
    const lastSpace = truncated.lastIndexOf(' ')
    result.title = (lastSpace > 60 ? truncated.slice(0, lastSpace) : truncated).trimEnd()
  }
  return result
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

export function registerAiHandlers(): void {

  // Picture Lookup — identify a set or minifig from an image (OpenAI only)
  ipcMain.handle(IPC.AI_PICTURE_LOOKUP, async (_e, imageB64: string) => {
    const settings = readSettings()
    if (!settings.openaiApiKey) {
      return { matches: [], model_used: 'none', error: 'OpenAI API key not configured — add it in Settings' }
    }
    try {
      const prompt =
        'Identify the LEGO set or minifigure in this image. ' +
        'Respond ONLY with a JSON object with keys: ' +
        'type ("set" or "minifigure"), name, set_number (or fig_number), ' +
        'year (integer or null), theme (or null), confidence (0.0-1.0). ' +
        'No markdown, just raw JSON.'
      const result = await callOpenAI(settings.openaiApiKey, {
        model: 'gpt-4o',
        max_tokens: 256,
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
          { type: 'text', text: prompt },
        ]}],
      })
      const text = extractText(result, 'openai')
      const data = parseAiJson(text) as Record<string, unknown>
      const blUrl = data.set_number
        ? `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${data.set_number}`
        : data.fig_number
          ? `https://www.bricklink.com/v2/catalog/catalogitem.page?M=${data.fig_number}`
          : null
      return {
        matches: [{ ...data, bricklink_url: blUrl }],
        model_used: 'gpt-4o',
      }
    } catch (err) {
      log.error('[AI] pictureLookup failed:', err)
      return { matches: [], model_used: 'gpt-4o', error: String(err) }
    }
  })

  // Piece Identifier — detect individual LEGO pieces (OpenAI only)
  ipcMain.handle(IPC.AI_PIECE_IDENTIFY, async (_e, imageB64: string) => {
    const settings = readSettings()
    if (!settings.openaiApiKey) {
      return { pieces: [], model_used: 'none', error: 'OpenAI API key not configured — add it in Settings' }
    }
    try {
      const prompt =
        'Identify all LEGO pieces visible in this image. ' +
        'For each piece respond with a JSON array of objects with keys: ' +
        'name (string), part_number (string or null), color (string), confidence (0-1). ' +
        'ONLY respond with the raw JSON array.'
      const result = await callOpenAI(settings.openaiApiKey, {
        model: 'gpt-4o',
        max_tokens: 512,
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
          { type: 'text', text: prompt },
        ]}],
      })
      const text = extractText(result, 'openai')
      const items = parseAiJson(text) as Record<string, unknown>[]
      const pieces = (Array.isArray(items) ? items : []).map((item) => ({
        name:         item.name ?? 'Unknown part',
        part_number:  item.part_number ?? null,
        color:        item.color ?? null,
        confidence:   parseFloat(String(item.confidence ?? 0.7)),
        bricklink_url: item.part_number
          ? `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${item.part_number}`
          : null,
      }))
      return { pieces, model_used: 'gpt-4o' }
    } catch (err) {
      log.error('[AI] pieceIdentify failed:', err)
      return { pieces: [], model_used: 'gpt-4o', error: String(err) }
    }
  })

  // AI Builder — premium stub
  ipcMain.handle(IPC.AI_BUILDER_GENERATE, async () => {
    return { error: 'AI Builder is a premium feature — coming soon' }
  })

  // ── eBay Listing Generator ─────────────────────────────────────────────────

  ipcMain.handle(IPC.LISTING_IDENTIFY_SET, async (
    _e, imageB64: string, mediaType = 'image/jpeg', themeHint = '', contextHint = '',
  ) => {
    const settings = readSettings()
    const provider = settings.aiProvider ?? 'openai'
    const model    = settings.aiModel    ?? 'gpt-4o-mini'
    const apiKey   = provider === 'anthropic' ? settings.anthropicApiKey : settings.openaiApiKey
    if (!apiKey) return { error: `${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key not configured — add it in Settings` }

    try {
      const prompt = buildIdentifyPrompt(themeHint, contextHint)
      let result: unknown
      if (provider === 'anthropic') {
        result = await callAnthropic(apiKey, {
          model, max_tokens: 400,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageB64 } },
            { type: 'text', text: prompt },
          ]}],
        })
      } else {
        result = await callOpenAI(apiKey, {
          model, max_tokens: 400,
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageB64}`, detail: 'high' } },
            { type: 'text', text: prompt },
          ]}],
        })
      }
      return parseAiJson(extractText(result, provider))
    } catch (err) {
      log.error('[Listing] identifySet failed:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.LISTING_GENERATE, async (_e, setData: unknown, prefs: unknown) => {
    const settings = readSettings()
    const provider = settings.aiProvider ?? 'openai'
    const model    = settings.aiModel    ?? 'gpt-4o-mini'
    const apiKey   = provider === 'anthropic' ? settings.anthropicApiKey : settings.openaiApiKey
    if (!apiKey) return { error: `${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key not configured — add it in Settings` }

    try {
      const prompt = buildListingPrompt(
        setData as Record<string, unknown>,
        prefs as Record<string, unknown>,
      )
      let result: unknown
      if (provider === 'anthropic') {
        result = await callAnthropic(apiKey, {
          model, max_tokens: 2500,
          messages: [{ role: 'user', content: prompt }],
        })
      } else {
        result = await callOpenAI(apiKey, {
          model, max_tokens: 2500,
          messages: [{ role: 'user', content: prompt }],
        })
      }
      const parsed = enforceTitleLimit(parseAiJson(extractText(result, provider)) as Record<string, unknown>)

      // Auto-save to history
      const sd = setData as { set_number?: string; name?: string; year?: number }
      if (parsed.title && sd.set_number) {
        try {
          saveListingHistory({
            set_number:  String(sd.set_number),
            set_name:    String(sd.name ?? ''),
            year:        sd.year ?? null,
            title:       String(parsed.title),
            description: String(parsed.description ?? ''),
            provider,
          })
        } catch (e) { log.warn('[Listing] history save failed:', e) }
      }
      return parsed
    } catch (err) {
      log.error('[Listing] generate failed:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.LISTING_HISTORY_LIST,   () => getListingHistory())
  ipcMain.handle(IPC.LISTING_HISTORY_DELETE, (_e, id: number) => deleteListingHistory(id))

  // Sidecar stubs — no-ops kept so any cached renderer calls don't throw
  ipcMain.handle('bf:sidecar:status',  () => ({ running: false, message: 'sidecar removed — AI runs directly in Node.js' }))
  ipcMain.handle('bf:sidecar:restart', () => ({ ok: true }))
}
