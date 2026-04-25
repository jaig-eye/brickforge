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
  const contextBlock = contextHint
    ? `⚠️  SELLER-PROVIDED CONTEXT — THIS IS AUTHORITATIVE:
"${contextHint}"
Your identification MUST be consistent with every word above. If the seller names a specific scene, location, vehicle, or event (e.g. "Mos Espa pod race", "trench run", "Eiffel Tower", "Technic truck"), the set you return MUST match those exact terms. Do NOT return a visually similar set that doesn't match the context. If you cannot find a perfect match, lower your confidence rather than ignoring the context.

`
    : ''
  const themeBlock = themeHint
    ? `Theme filter: '${themeHint}' — restrict your search to sets within this theme.\n\n`
    : ''

  return `You are a world-class LEGO expert and set identifier. Carefully examine the image.

${contextBlock}${themeBlock}Analyse clues in this priority order:

1. SELLER CONTEXT (if provided above — authoritative, must match)
   - Every named scene, location, character, or vehicle must appear in the set's official name or description
   - Example: "pod race" → only Podrace sets qualify; "Mos Espa" → only Mos Espa sets qualify
   - A visually similar set that contradicts the seller context is WRONG — lower confidence instead

2. SET NUMBER
   - Printed on the box, instruction booklet cover, or visible stickers — highest certainty if readable

3. MINIFIGURES (strong signal for named sets)
   - Name every minifigure — outfit, helmet, face print, accessories
   - Exclusive or rare minifigures narrow it to one or very few sets → confidence 0.85+

4. SET FORMAT — distinguish carefully between these types:
   - DIORAMA: flat scene display base, captures one specific moment/location (e.g. "Mos Espa Podrace Diorama" ≠ "Death Star Trench Run Diorama" — they depict different scenes)
   - UCS / ULTIMATE COLLECTOR SERIES: large adult-display model, single vehicle, $200–$800+
   - MIDSCALE: medium-size vehicle, NOT the flagship UCS version of the same ship
   - VEHICLE COLLECTION / PACK: multiple small vehicles in one box
   - PLAYSET: functional environment with characters and play features
   - Never conflate two different dioramas, or a midscale with a UCS, or a collection pack with a large single set

5. DISTINCTIVE BUILD FEATURES
   - Unique shapes, colour schemes, structural elements specific to one set

6. TEXT / BRANDING
   - Any visible text, logos, ship names, location names

IMPORTANT: Always provide your best guess. Do NOT return empty fields unless the image contains no LEGO content whatsoever.

Return ONLY a valid JSON object — no markdown, no extra text:
{"set_number": "75380", "set_name": "Mos Espa Podrace Diorama", "confidence": 0.92, "notes": "Podrace scene, sandy desert base, Anakin's pod visible — matches seller context 'Mos Espa pod race'"}

set_number: official LEGO set number, digits only, no -1 suffix.
set_name: full official name.
confidence: 0.0–1.0.
notes: list every specific clue used — minifigures spotted, text seen, format identified, and whether seller context was matched or not.`
}

function buildListingPrompt(setData: Record<string, unknown>, prefs: Record<string, unknown>): string {
  const completeness  = (prefs.completeness as string) ?? 'complete'
  const hasManual     = prefs.includes_instructions !== false
  const hasFigs       = prefs.includes_figures !== false
  const smokeFree     = !!prefs.smoke_free_home
  const cleanSet      = !!prefs.clean_set

  const condToken     = completeness === 'complete' ? 'Complete' : completeness === 'partial' ? '99% Complete' : 'Incomplete'
  const conditionDesc =
    completeness === 'complete' ? 'Complete — all pieces present and verified' :
    completeness === 'partial'  ? '99% Complete — may be missing a small number of minor pieces' :
                                  'Incomplete — some pieces are missing'

  const minifigs  = (setData.num_minifigures ?? setData.minifig_count ?? 0) as number
  const pieces    = setData.piece_count ?? setData.num_parts ?? ''
  const year      = setData.year ?? ''
  const theme     = setData.theme ?? ''
  const name      = setData.name ?? ''
  const setNo     = setData.set_number ?? ''

  // Minifig handling: 3 distinct cases
  // Case 1: set has no minifigs (minifigs === 0) — omit from listing entirely
  // Case 2: set has minifigs AND seller is including them
  // Case 3: set has minifigs BUT seller is NOT including them
  const setHasFigs = minifigs > 0
  const figAttr = !setHasFigs ? null : hasFigs ? `All ${minifigs} minifigure${minifigs !== 1 ? 's' : ''} included` : `Minifigures NOT included (sold separately)`
  const figNote = !setHasFigs ? '' : hasFigs ? '' : '\nIMPORTANT: This set normally includes minifigures but the seller is NOT including them. Make this clearly visible in the description.'

  const attrs: string[] = []
  if (smokeFree) attrs.push('From a smoke-free home')
  if (cleanSet)  attrs.push('Clean, well-maintained set')
  attrs.push(hasManual ? 'Includes original instruction manual' : 'No instruction manual included')
  if (figAttr) attrs.push(figAttr)

  const manualToken = hasManual ? 'w/ Manual' : 'No Manual'
  const figsToken   = !setHasFigs ? '' : hasFigs ? `w/ ${minifigs} Minifig${minifigs !== 1 ? 's' : ''}` : 'No Figs'
  const extraTokens = [cleanSet ? 'Clean' : '', smokeFree ? 'Smoke-Free' : ''].filter(Boolean).join(' ')

  // Build minifigs table row only when set actually has figs
  const figTableRow = setHasFigs
    ? `\n      - Minifigures row: "${hasFigs ? `${minifigs} included` : 'NOT included — sold separately'}"`
    : `\n      - Minifigures: OMIT THIS ROW ENTIRELY — this set has no minifigures`

  return `You are an expert eBay seller specialising in LEGO sets. Generate a premium keyword-optimised eBay listing.

SET DETAILS
Set Number : ${setNo}
Name       : ${name}
Year       : ${year}
Theme      : ${theme || 'LEGO'}
Pieces     : ${pieces}
Minifigs   : ${minifigs > 0 ? minifigs : 'None — this set does not include minifigures'}

SELLER ATTRIBUTES
${attrs.map(a => `• ${a}`).join('\n')}
Condition  : ${conditionDesc}
${figNote}
OUTPUT FORMAT — return ONLY a JSON object with exactly TWO keys: "title" and "description".

"title" — eBay title rules:
  • HARD LIMIT: 80 characters. NEVER exceed this.
  • Pack keywords in this priority order:
      1. LEGO  2. Theme: ${theme}  3. Set#: ${setNo}  4. Name: ${name}
      5. Year: ${year}  6. ${pieces}pcs  7. ${condToken}  8. ${manualToken}${figsToken ? `  9. ${figsToken}` : ''}${extraTokens ? `  10. ${extraTokens}` : ''}
  • Abbreviations: "pcs", "w/", "&", drop articles.

"description" — Rich eBay HTML listing with full inline CSS. Dark theme, gold accents. Structure:

  WRAPPER: <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;background:#0d0d0d;border-radius:8px;overflow:hidden;border:2px solid #FFD700;">

  HEADER BANNER: gold gradient background (#FFD700 → #FFA500), black text. Show: "Official LEGO® Set" label (uppercase, small), set name (large bold), set# • year • pieces on one line below.

  ABOUT SECTION: dark background (#111), gold uppercase label "About This Set", then 4–6 sentences of enthusiastic, detailed retail-style copy. Cover: what the set depicts/builds, why it's special, who it appeals to, any notable features (display-worthy, complex build, part of a series, etc.). Do NOT mention shipping, payment, or returns.

  SET DETAILS TABLE: dark background (#0d0d0d), gold uppercase label "Set Details". Full-width table, alternating row backgrounds (#111 and #0d0d0d), left column labels in #888, right column values in white bold. Rows:
      - Set Number
      - Name
      - Year
      - Theme${figTableRow}
      - Piece Count: "${pieces} pieces"
      - Condition: "${conditionDesc}"

  WHAT'S INCLUDED: dark background (#111), gold uppercase label "What's Included". Unstyled list — each item as: checkmark ✓ (color #FFD700) for positive items, ✗ (color #ff4444) for negative items (no manual, no figs). Use HTML entities &#10003; and &#10007;. Inline-style each li: no list-style, padding 8px 0, border-bottom 1px solid #1e1e1e, display flex, gap 10px, color #ddd, font-size 13px.

  FOOTER: very dark background (#080808), centered small text in #555: "Authentic LEGO® product — not a third-party or counterfeit item. All items personally inspected and verified."

  CLOSE wrapper div.

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
          model, max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        })
      } else {
        result = await callOpenAI(apiKey, {
          model, max_tokens: 4000,
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
