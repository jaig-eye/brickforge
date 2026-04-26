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
import { searchRebrickableSets } from '../api/rebrickable'

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

function buildIdentifyPrompt(
  themeHint = '',
  contextHint = '',
  candidates: { set_num: string; name: string; year: number; num_parts: number }[] = [],
): string {
  const contextBlock = contextHint
    ? `⚠️  SELLER-PROVIDED CONTEXT — THIS IS AUTHORITATIVE:
"${contextHint}"
Your identification MUST be consistent with every word above. If the seller names a specific scene, location, vehicle, or event (e.g. "Mos Espa pod race", "trench run", "Eiffel Tower", "Technic truck"), the set you return MUST match those exact terms. Do NOT return a visually similar set that doesn't match the context. If you cannot find a perfect match, lower your confidence rather than ignoring the context.

`
    : ''

  const candidateBlock = candidates.length > 0
    ? `REBRICKABLE CANDIDATE SETS — real sets from the database that match the seller's context.
If the correct set is in this list, you MUST return that exact set_number.
Use year and piece count to distinguish similarly-named sets (e.g. UCS vs midscale vs collection pack).
Only deviate if a set number is clearly visible in the image and it contradicts this list.
${candidates.map(c => `  • ${c.set_num} — ${c.name} (${c.year}, ${c.num_parts} pcs)`).join('\n')}

`
    : ''

  const themeBlock = themeHint
    ? `Theme filter: '${themeHint}' — restrict your search to sets within this theme.\n\n`
    : ''

  return `You are a world-class LEGO expert and set identifier. Carefully examine the image.

${contextBlock}${candidateBlock}${themeBlock}Analyse clues in this priority order:

1. REBRICKABLE CANDIDATES (if listed above — highest priority)
   - Pick from the candidate list; use year and piece count to choose between similar names
   - A 220-piece set is NOT the same as a 7,500-piece UCS version of the same ship
   - A "Starship Collection" or "Vehicle Collection" is a small multi-pack, not a large single-vehicle set

2. SELLER CONTEXT (if provided above — must match, never ignore)
   - Every named scene, location, character, or vehicle must appear in the set's official name or description
   - Example: "pod race" → only Podrace sets qualify; "Mos Espa" → only Mos Espa sets qualify
   - A visually similar set that contradicts the seller context is WRONG — lower confidence instead

3. SET NUMBER
   - Printed on the box, instruction booklet cover, or visible stickers — highest certainty if readable

4. MINIFIGURES (strong signal for named sets)
   - Name every minifigure — outfit, helmet, face print, accessories
   - Exclusive or rare minifigures narrow it to one or very few sets → confidence 0.85+

5. SET FORMAT — distinguish carefully between these types:
   - DIORAMA: flat scene display base, captures one specific moment/location
   - UCS / ULTIMATE COLLECTOR SERIES: large adult-display model, single vehicle, $200–$800+, 2000+ pieces
   - MIDSCALE: medium-size vehicle (200–800 pieces), NOT the flagship UCS version of the same ship
   - VEHICLE COLLECTION / STARSHIP COLLECTION / PACK: multiple small vehicles in one box, typically under 300 pieces total
   - PLAYSET: functional environment with characters and play features
   - Never conflate two different dioramas, or a midscale with a UCS, or a collection pack with a large single set

6. DISTINCTIVE BUILD FEATURES
   - Unique shapes, colour schemes, structural elements specific to one set

7. TEXT / BRANDING
   - Any visible text, logos, ship names, location names

IMPORTANT: Always provide your best guess. Do NOT return empty fields unless the image contains no LEGO content whatsoever.

Return ONLY a valid JSON object — no markdown, no extra text:
{"set_number": "75380", "set_name": "Mos Espa Podrace Diorama", "confidence": 0.92, "notes": "Podrace scene, sandy desert base, Anakin's pod visible — matches seller context 'Mos Espa pod race'"}

set_number: official LEGO set number, digits only, no -1 suffix.
set_name: full official name.
confidence: 0.0–1.0.
notes: list every specific clue used — minifigures spotted, text seen, format identified, and whether seller context and candidates were matched.`
}

function buildListingPrompt(setData: Record<string, unknown>, prefs: Record<string, unknown>): string {
  const completeness  = (prefs.completeness as string) ?? 'complete'
  const hasManual     = prefs.includes_instructions !== false
  const hasFigs       = prefs.includes_figures !== false
  const smokeFree     = !!prefs.smoke_free_home
  const cleanSet      = !!prefs.clean_set
  const sellerNotes   = (prefs.seller_notes as string | null) ?? null

  const condToken     = completeness === 'complete' ? 'Complete' : completeness === 'partial' ? '99% Complete' : 'Incomplete'
  const conditionDesc =
    completeness === 'complete' ? 'Complete' :
    completeness === 'partial'  ? '99% Complete — may be missing a small number of minor pieces' :
                                  'Incomplete — missing pieces, listed as-is'

  const minifigs  = (setData.num_minifigures ?? setData.minifig_count ?? 0) as number
  const pieces    = setData.piece_count ?? setData.num_parts ?? ''
  const year      = setData.year ?? ''
  const theme     = setData.theme ?? ''
  const name      = setData.name ?? ''
  const setNo        = setData.set_number ?? ''
  const displaySetNo = (setNo as string).replace(/-\d+$/, '')

  // Minifig handling — 3 distinct cases
  const setHasFigs = minifigs > 0

  // Only add attrs that are explicitly checked — never add negative/omission messages
  const attrs: string[] = []
  if (smokeFree)             attrs.push('From a smoke-free home')
  if (cleanSet)              attrs.push('Clean, well-maintained set')
  if (hasManual)             attrs.push('Includes original instruction manual')
  if (setHasFigs && hasFigs) attrs.push(`All ${minifigs} minifigure${minifigs !== 1 ? 's' : ''} included`)

  // Title tokens — empty when unchecked (not included in title at all)
  const manualToken = hasManual ? 'w/ Manual' : ''
  const figsToken   = (setHasFigs && hasFigs) ? `w/ ${minifigs} Minifig${minifigs !== 1 ? 's' : ''}` : ''
  const extraTokens = [cleanSet ? 'Clean' : '', smokeFree ? 'Smoke-Free' : ''].filter(Boolean).join(' ')

  // Minifigs table row — omit entirely when seller is not including figs
  const figTableRow = !setHasFigs
    ? `\n      - Minifigures: OMIT THIS ROW ENTIRELY — this set has no minifigures`
    : hasFigs
      ? `\n      - Minifigures row: "${minifigs} included"`
      : `\n      - Minifigures: OMIT THIS ROW ENTIRELY — seller is not including minifigures in this listing`

  const sellerNotesSection = sellerNotes
    ? `\n  SELLER NOTES SECTION (only if seller_notes present): dark background (#111), amber/yellow label "Seller Notes". Display the seller's notes verbatim in white text, font-size 13px. This section communicates the exact condition details, quirks, or special info the seller provided.`
    : ''

  return `You are an expert eBay seller specialising in LEGO sets. Generate a premium keyword-optimised eBay listing.

SET DETAILS
Set Number : ${displaySetNo}
Name       : ${name}
Year       : ${year}
Theme      : ${theme || 'LEGO'}
Pieces     : ${pieces}
Minifigs   : ${minifigs > 0 ? minifigs : 'None — this set does not include minifigures'}

SELLER ATTRIBUTES
${attrs.map(a => `• ${a}`).join('\n')}
Condition  : ${conditionDesc}

OUTPUT FORMAT — return ONLY a JSON object with exactly TWO keys: "title" and "description".

"title" — eBay title rules:
  • HARD LIMIT: 80 characters. NEVER exceed this.
  • NO emoji — plain text only.
  • Lead with the product name, not a label. Structure: LEGO [Theme] [Name] [SetNum] | [details]
  • Use " | " as a visual separator between the item identity and the condition/attribute details.
  • Keyword priority order:
      1. LEGO  2. Theme: ${theme || ''}  3. Name: ${name}  4. ${displaySetNo}
      5. ${condToken}${manualToken ? `  6. ${manualToken}` : ''}${figsToken ? `  7. ${figsToken}` : ''}${extraTokens ? `  8. ${extraTokens}` : ''}
  • If Theme is blank or redundant with Name, omit it — never repeat the same word twice.
  • Example format: "LEGO Star Wars Invisible Hand 75377 | Complete w/ Manual"
  • Abbreviations: "w/", "&", drop articles.

"description" — Clean, modern eBay HTML listing with full inline CSS. Dark theme. Structure:

  WRAPPER: <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;background:#111;border-radius:10px;overflow:hidden;border:1px solid #2a2a2a;">

  HEADER: background #1a1a1a, left border 4px solid #FFD700, padding 20px 24px. Show set name in large white bold text (font-size:22px), then the literal text "#${displaySetNo} · ${year}" in small #888 text below.

  ABOUT SECTION: background #111, padding 20px 24px. Label: uppercase tracking-wide font-size:11px color:#FFD700 margin-bottom:10px. Then 4–6 sentences of natural, enthusiastic copy: what the set is, why it's collectible, who it's for, what makes it special. Do NOT mention shipping, payment, or returns.

  SET DETAILS TABLE: background #161616, padding 20px 24px. Label same style as above. Full-width table, border-collapse collapse. Alternating row backgrounds #1a1a1a and #161616, each row padding 10px 0, border-bottom 1px solid #222. Left cell: labels in #666, font-size:13px, width:40%. Right cell: values in #eee bold, font-size:13px. Rows:
      - Set Number
      - Name
      - Year
      - Theme${figTableRow}
      - Condition: "${conditionDesc}"
${sellerNotes ? `      - Seller Notes: "${sellerNotes}"` : ''}
  WHAT'S INCLUDED: background #111, padding 20px 24px. Label same style. Unstyled list — only show items that ARE included (✓ green, HTML entity &#10003;). Do NOT add ✗ rows for items not checked by the seller. Each li: list-style none, padding 8px 0, border-bottom 1px solid #1e1e1e, display flex, gap 12px, align-items center, color #ccc, font-size 13px. Always include the set itself as the first ✓ item.
${sellerNotesSection}
  FOOTER: background #0d0d0d, padding 14px 24px, centered small text in #444, font-size:11px: "Authentic LEGO® product · Not a third-party or counterfeit item · All items personally inspected"

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

// ── eBay Sold Price Scraper ────────────────────────────────────────────────────

interface EbaySoldData {
  prices: number[]
  median: number
  low: number
  high: number
  count: number
  url: string
}

function ebayGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const follow = (u: string, hops = 0) => {
      if (hops > 5) return reject(new Error('Too many redirects'))
      https.get(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Encoding': 'identity',
        },
      }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          follow(res.headers.location, hops + 1); return
        }
        let data = ''
        res.on('data', c => (data += c))
        res.on('end', () => resolve(data))
      }).on('error', reject).setTimeout(15_000, function (this: { destroy(): void }) { this.destroy(); reject(new Error('eBay request timed out')) })
    }
    follow(url)
  })
}

async function fetchEbaySoldPrices(
  setNum: string,
  name: string,
  condition: 'new' | 'used',
): Promise<EbaySoldData | null> {
  const shortName = name.split(' ').slice(0, 4).join(' ')
  const query = encodeURIComponent(`LEGO ${setNum} ${shortName}`)
  const condFilter = condition === 'new' ? '&LH_ItemCondition=1000' : '&LH_ItemCondition=3000'
  const url = `https://www.ebay.com/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1&_sop=13${condFilter}&_ipg=25`
  try {
    const html = await ebayGet(url)
    const prices: number[] = []

    // Primary: POSITIVE spans = sold prices (eBay displays in green)
    const posRe = /class="[^"]*POSITIVE[^"]*"[^>]*>\$?\s*([\d,]+\.?\d*)/g
    let m: RegExpExecArray | null
    while ((m = posRe.exec(html)) !== null) {
      const p = parseFloat(m[1].replace(/,/g, ''))
      if (p >= 1 && p <= 20000) prices.push(p)
    }
    // Fallback: s-item__price spans
    if (prices.length < 3) {
      const itemRe = /s-item__price[^>]*>(?:<[^>]+>)*\$?\s*([\d,]+\.?\d*)/g
      while ((m = itemRe.exec(html)) !== null) {
        const p = parseFloat(m[1].replace(/,/g, ''))
        if (p >= 1 && p <= 20000) prices.push(p)
      }
    }
    if (prices.length === 0) return null

    // IQR filter — removes shipping costs and outliers
    const sorted = [...prices].sort((a, b) => a - b)
    const q1 = sorted[Math.floor(sorted.length * 0.25)]
    const q3 = sorted[Math.floor(sorted.length * 0.75)]
    const iqr = q3 - q1
    const filtered = sorted.filter(p => p >= Math.max(q1 - 1.5 * iqr, 5) && p <= q3 + 1.5 * iqr)
    if (filtered.length === 0) return null

    const median = filtered[Math.floor(filtered.length / 2)]
    return { prices: filtered, median, low: filtered[0], high: filtered[filtered.length - 1], count: filtered.length, url }
  } catch (err) {
    log.warn('[eBay] price scrape failed:', err)
    return null
  }
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
      // Ground the AI with real Rebrickable results when context/theme is provided
      let candidates: { set_num: string; name: string; year: number; num_parts: number }[] = []
      if (contextHint || themeHint) {
        try {
          const res = await searchRebrickableSets(contextHint || themeHint)
          candidates = res.slice(0, 8).map(s => ({ set_num: s.set_num, name: s.name, year: s.year, num_parts: s.num_parts }))
        } catch { /* non-fatal — proceed without candidates */ }
      }
      const prompt = buildIdentifyPrompt(themeHint, contextHint, candidates)
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

  ipcMain.handle(IPC.LISTING_PRICE_SUGGEST, async (
    _e, setNum: string, name: string, condition: 'new' | 'used',
  ) => {
    return fetchEbaySoldPrices(setNum, name, condition)
  })

  // Sidecar stubs — no-ops kept so any cached renderer calls don't throw
  ipcMain.handle('bf:sidecar:status',  () => ({ running: false, message: 'sidecar removed — AI runs directly in Node.js' }))
  ipcMain.handle('bf:sidecar:restart', () => ({ ok: true }))
}
