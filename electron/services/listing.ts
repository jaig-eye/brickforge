/**
 * Sell: writes an eBay-ready title and HTML description for a set, suggests a
 * price from BrickLink sold data, and keeps a history of what it wrote.
 */
import { AppError } from '../../src/lib/errors'
import { sanitizeHtml } from '../../src/lib/sanitize-html'
import type { ListingInput, ListingPrefs, ListingResult, PriceCondition, PriceSuggestion } from '../../src/lib/types'
import { resolveProvider, callText, parseAiJson } from '../api/ai'
import { lookupSet, getSetMinifigs, resolveThemeName } from '../api/rebrickable'
import { fetchBricklinkPrice, hasBricklinkCredentials } from '../api/bricklink'
import { getSetByNumber } from '../db/queries/collection.queries'
import { saveListing } from '../db/queries/listing.queries'

/** Everything the writer needs about a set: from your collection first, then the catalog. */
export async function listingInputFor(setNumber: string): Promise<ListingInput> {
  const num = setNumber.includes('-') ? setNumber : `${setNumber}-1`
  const local = getSetByNumber(num)
  const remote = local ? null : await lookupSet(num)
  if (!local && !remote) throw new AppError({ code: 'not_found', service: 'rebrickable', message: `Set ${setNumber} isn't in the catalog.` })
  const figs = await getSetMinifigs(num).catch(() => [])
  return {
    set_number: local?.set_number ?? remote!.set_num,
    name: local?.name ?? remote!.name,
    year: local?.year ?? remote!.year,
    theme: local?.theme ?? (await resolveThemeName(remote?.theme_id)),
    piece_count: local?.piece_count ?? remote?.num_parts ?? null,
    minifig_count: figs.reduce((n, f) => n + (f.quantity || 1), 0),
  }
}

/** eBay caps titles at 80 characters; cut at a word and drop dangling separators. */
export function fitTitle(title: string): string {
  let t = title.replace(/\s+/g, ' ').trim()
  if (t.length > 80) {
    // Look one character past the cap: a word that ends exactly at 80 still fits
    const space = t.slice(0, 81).lastIndexOf(' ')
    t = space > 50 ? t.slice(0, space) : t.slice(0, 80)
  }
  // "… | Complete w/" → "… | Complete"; a comma sits right after its word ("… Box, Minifigs,")
  for (let i = 0; i < 3; i++) t = t.replace(/(\s+(\||&|w\/|with|and|-|·)|\s*,)+$/i, '').trim()
  return t
}

export async function generateListing(input: ListingInput, prefs: ListingPrefs): Promise<ListingResult> {
  const p = resolveProvider()
  if (p instanceof AppError) throw p
  const parsed = parseAiJson<{ title?: string; description?: string }>(await callText(p, buildListingPrompt(input, prefs)))
  if (!parsed.title || !parsed.description) {
    throw new AppError({ code: 'service', message: "The AI's answer was missing a title or description. Try again." })
  }
  const title = fitTitle(String(parsed.title))
  const description = sanitizeHtml(String(parsed.description))
  const saved = saveListing({
    set_number: input.set_number, set_name: input.name, year: input.year,
    title, description, provider: p.id === 'claude-code' ? 'claude-code' : `${p.id}:${p.model}`,
  })
  return { id: saved.id, title, description }
}

/** BrickLink's recent sold average for a set in one condition (US). */
export async function priceSuggestion(number: string, condition: PriceCondition, type: 'SET' | 'MINIFIG' = 'SET'): Promise<PriceSuggestion | null> {
  if (!hasBricklinkCredentials()) {
    throw new AppError({ code: 'missing_key', service: 'bricklink', message: `Add your BrickLink keys in Settings to see what this ${type === 'SET' ? 'set' : 'minifigure'} sells for.` })
  }
  const res = await fetchBricklinkPrice(number, condition, type)
  if (!res) return null
  return { condition, avg: res.avg_price, min: res.min_price, max: res.max_price, samples: res.sample_count, source: res.source }
}

export function buildListingPrompt(d: ListingInput, prefs: ListingPrefs): string {
  const displayNo = d.set_number.replace(/-\d+$/, '')
  const conditionDesc = prefs.completeness === 'complete' ? 'Complete'
    : prefs.completeness === 'partial' ? '99% Complete — may be missing a small number of minor pieces'
    : 'Incomplete — missing pieces, listed as-is'
  const condToken = prefs.completeness === 'complete' ? 'Complete' : prefs.completeness === 'partial' ? '99% Complete' : 'Incomplete'
  const figs = d.minifig_count
  const includeFigs = figs > 0 && prefs.includes_figures

  const attrs: string[] = []
  if (prefs.smoke_free_home) attrs.push('From a smoke-free home')
  if (prefs.clean_set) attrs.push('Clean, well-maintained set')
  if (prefs.includes_instructions) attrs.push('Includes original instruction manual')
  if (prefs.includes_box) attrs.push('Includes original box')
  if (includeFigs) attrs.push(`All ${figs} minifigure${figs !== 1 ? 's' : ''} included`)

  const tokens = [
    prefs.includes_instructions ? 'w/ Manual' : '',
    prefs.includes_box ? 'w/ Box' : '',
    includeFigs ? `w/ ${figs} Minifig${figs !== 1 ? 's' : ''}` : '',
    prefs.clean_set ? 'Clean' : '',
    prefs.smoke_free_home ? 'Smoke-Free' : '',
  ].filter(Boolean)

  const figRow = figs === 0 ? '- Minifigures: OMIT THIS ROW — this set has no minifigures'
    : includeFigs ? `- Minifigures: "${figs} included"`
    : '- Minifigures: OMIT THIS ROW — the seller is not including minifigures'
  const notes = prefs.seller_notes?.replace(/[<>]/g, '').slice(0, 600) || null

  return `You are an expert eBay seller specialising in LEGO sets. Write a premium, keyword-optimised eBay listing.

SET DETAILS
Set Number : ${displayNo}
Name       : ${d.name}
Year       : ${d.year ?? ''}
Theme      : ${d.theme || 'LEGO'}
Pieces     : ${d.piece_count ?? ''}
Minifigs   : ${figs > 0 ? figs : 'None — this set has no minifigures'}

SELLER ATTRIBUTES
${attrs.map((a) => `• ${a}`).join('\n') || '• (none)'}
Condition  : ${conditionDesc}

OUTPUT — return ONLY a JSON object with exactly two keys, "title" and "description".

"title" rules:
  • HARD LIMIT 80 characters. Plain text, no emoji.
  • Structure: LEGO [Theme] [Name] ${displayNo} | [condition and extras]
  • Keyword order: LEGO, ${d.theme || ''}, ${d.name}, ${displayNo}, ${condToken}${tokens.length ? `, ${tokens.join(', ')}` : ''}
  • Omit the theme when it repeats words from the name. Never repeat a word. Use "w/" and "&"; drop articles.
  • Example: "LEGO Star Wars Invisible Hand 75377 | Complete w/ Manual"

"description" — clean, modern eBay HTML with inline CSS only (no <style>, <script>, images, or links). Dark theme:
  WRAPPER: <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;background:#111;border-radius:10px;overflow:hidden;border:1px solid #2a2a2a;">
  HEADER: background #1a1a1a, left border 4px solid #FFC929, padding 20px 24px. Set name in white bold 22px, then "#${displayNo} · ${d.year ?? ''}" in small #888 text.
  ABOUT: padding 20px 24px. Label uppercase 11px letter-spaced #FFC929. Then 4–6 sentences of natural, enthusiastic copy about the set, why it's collectible, and who it's for. No shipping, payment, or returns talk.
  DETAILS TABLE: background #161616, padding 20px 24px, same label style. Full-width table, alternating row backgrounds #1a1a1a / #161616, bottom borders #222. Label cells #777 13px 40% wide; value cells #eee bold 13px. Rows: Set Number, Name, Year, Theme, ${figRow.replace(/^- /, '')}, Condition ("${conditionDesc}")${notes ? `, Seller Notes ("${notes}")` : ''}.
  WHAT'S INCLUDED: padding 20px 24px, same label style. A list of only what IS included, each item prefixed with a green ✓ (&#10003;), the set itself first. List items: no bullets, padding 8px 0, bottom border #1e1e1e, color #ccc, 13px.
  FOOTER: background #0d0d0d, padding 14px 24px, centered #555 11px text: "Authentic LEGO® product · Personally inspected".

Return ONLY the raw JSON object. No markdown fences, no extra text.`
}
