/**
 * Photo identification — sets, minifigures, pieces, and photographed lists.
 *
 * Every answer is grounded in the real catalog: the free Brickognize
 * recognizer proposes candidates, and when it isn't sure, an AI judges the
 * photo against the candidates' OFFICIAL images. Returned numbers are always
 * real catalog records, never invented ids.
 */
import { AppError } from '../../src/lib/errors'
import { bricklinkCatalogUrl } from '../../src/lib/lego-ids'
import type {
  FigIdentifyResult, FigMatch, SetIdentifyResult, SetCandidate, PieceIdentifyResult, ImportItem,
} from '../../src/lib/types'
import log from '../main/logger'
import { brickognizeFigs, brickognizeSets, brickognizeParts, trustedTop } from '../api/brickognize'
import { searchMinifigs, searchSets, lookupSet, resolveThemeName, hasRebrickableKey, type RebrickableSet } from '../api/rebrickable'
import { resolveProvider, callVision, parseAiJson, type Provider, type VisionPart } from '../api/ai'
import { prepImage, fetchThumb, type Box } from './images'
import { ensureFigBricklinkId } from './catalog'

// A Brickognize fig or part match at or above this score is trusted outright.
export const BRICKOGNIZE_TRUST = 0.5

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number(n) || 0))
/** "75192-1" and "75192" are the same set. */
export const stripSetSuffix = (n: string) => n.replace(/-\d+$/, '')

async function soft<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() } catch (err) {
    log.warn('[identify] soft failure:', err instanceof Error ? err.message : err)
    return fallback
  }
}

// ── Minifigures ───────────────────────────────────────────────────────────────

/**
 * Photo → catalog-verified minifig matches.
 * 0. Brickognize: a confident hit returns BrickLink ids directly, no AI needed.
 * 1. AI describes the photo (and classifies the subject — people scan built
 *    sets in fig mode all the time).
 * 2. Rebrickable search turns that into real candidates.
 * 3. AI picks from the candidates by comparing official images to the photo.
 */
export async function identifyMinifigPhoto(photo: Buffer): Promise<FigIdentifyResult> {
  const img = prepImage(photo)
  const bk = await brickognizeFigs(img.buffer, img.mediaType)
  const bkTop = trustedTop(bk, BRICKOGNIZE_TRUST)
  if (bkTop && bk.ok) {
    return {
      matches: bk.items.slice(0, 3).map((i) => ({
        fig_number: i.id,
        name: i.name,
        image_url: i.img_url ?? null,
        confidence: clamp01(i.score),
        bricklink_id: i.id,
        reason: 'Brickognize visual match',
      })),
      description: bkTop.name,
      model_used: 'brickognize',
    }
  }
  const bkItems = bk.ok ? bk.items : []

  const p = resolveProvider()
  if (p instanceof AppError) {
    // Name the ACTUAL failure — a service outage is not "no visual match"
    const error = !bk.ok
      ? `The recognition service is unavailable (${bk.reason}), and no AI is set up as a fallback. Check your connection, or add an AI provider in Settings.`
      : bkItems.length
        ? 'The visual match was uncertain, and no AI is set up to double-check it. Pick from the suggestions, or add an AI provider in Settings.'
        : 'No visual match found, and no AI is set up as a fallback. Try a clearer photo, or add an AI provider in Settings.'
    return {
      matches: bkItems.slice(0, 3).map((i) => ({
        fig_number: i.id, name: i.name, image_url: i.img_url ?? null,
        confidence: Math.min(clamp01(i.score), 0.45), bricklink_id: i.id, reason: 'Uncertain visual match',
      })),
      description: null, model_used: bkItems.length ? 'brickognize' : 'none', error,
    }
  }

  const describePrompt = `You are a LEGO expert. Examine this photo carefully.
First decide the MAIN SUBJECT: a single minifigure ("minifig"), a built set/scene/building ("set"), loose parts ("parts"), or something else ("other"). A minifigure that is merely part of a larger displayed set does not make the subject "minifig".
Return ONLY a JSON object (no markdown):
{"subject": "minifig|set|parts|other", "character": "most likely character name", "franchise": "theme/franchise (e.g. Star Wars, Ninjago, City)", "features": ["torso print detail", "headgear", "face print", "leg print", "accessories"], "search_terms": ["2-4 word Rebrickable search query, most specific first", "fallback broader query"]}
For non-minifig subjects, character/features/search_terms may be empty.
Be specific: exact costume variant, armor style, colors, cape/no cape.`
  let desc: { subject?: string; character?: string; franchise?: string; search_terms?: string[] }
  try {
    desc = parseAiJson(await callVision(p, [{ type: 'image', b64: img.b64, mediaType: img.mediaType, detail: 'high' }, { type: 'text', text: describePrompt }]))
  } catch (err) {
    return { matches: [], description: null, model_used: p.model, error: `The AI couldn't describe the photo: ${err instanceof Error ? err.message : err}` }
  }

  // Wrong mode — the scan worker reroutes non-crop jobs to set identification
  if (desc.subject === 'set' || desc.subject === 'parts') {
    return {
      matches: [],
      description: desc.character || desc.franchise || null,
      subject: desc.subject,
      model_used: p.model,
      error: desc.subject === 'set'
        ? 'This photo looks like a built set, not a single minifigure.'
        : 'This photo looks like loose parts. Try the Pieces tab.',
    }
  }

  const queries = [...(desc.search_terms ?? []), desc.character ?? '', [desc.franchise, desc.character].filter(Boolean).join(' ')]
    .map((q) => q.trim()).filter(Boolean)
  const seen = new Set<string>()
  const candidates: { set_num: string; name: string; set_img_url: string | null }[] = []
  // Brickognize's below-threshold suggestions are still strong candidates
  for (const i of bkItems.slice(0, 5)) {
    if (!seen.has(i.id)) { seen.add(i.id); candidates.push({ set_num: i.id, name: i.name, set_img_url: i.img_url }) }
  }
  for (const q of queries) {
    if (candidates.length >= 14) break
    for (const r of await soft(() => searchMinifigs(q, 12), [])) {
      if (!seen.has(r.set_num)) { seen.add(r.set_num); candidates.push(r) }
      if (candidates.length >= 14) break
    }
  }
  const description = [desc.character, desc.franchise].filter(Boolean).join(' — ') || null
  if (!candidates.length) {
    return {
      matches: [], description, model_used: p.model,
      error: hasRebrickableKey()
        ? 'No catalog candidates found. Add the minifigure from search, or retake the photo closer up.'
        : 'Add a free Rebrickable key in Settings so the AI has catalog candidates to choose from.',
    }
  }

  // Judge VISUALLY: the photo and each candidate's official image side by side
  const thumbs = await Promise.all(candidates.slice(0, 6).map((c) => fetchThumb(c.set_img_url)))
  const parts: VisionPart[] = [
    { type: 'text', text: 'You are a LEGO minifigure expert. The FIRST image is a photo of a minifigure — possibly at an odd angle, from the side or back, or held in hand. Judge by torso print, headgear, hair, face print, and leg details, NEVER by pose or camera angle. Official catalog images of real candidates follow, each labeled.' },
    { type: 'image', b64: img.b64, mediaType: img.mediaType, detail: 'high' },
  ]
  candidates.forEach((c, i) => {
    const t = thumbs[i]
    parts.push({ type: 'text', text: `CANDIDATE ${i + 1}: ${c.set_num} — ${c.name}${t ? '' : ' (no image available — judge by name)'}` })
    if (t) parts.push({ type: 'image', b64: t.b64, mediaType: t.mediaType, detail: 'low' })
  })
  parts.push({
    type: 'text',
    text: `Compare the photo against each candidate image, detail by detail. Return ONLY JSON (no markdown):
{"picks": [{"fig_number": "exact candidate id from the list", "confidence": 0.0-1.0, "reason": "the discriminative details that match/exclude"}]}
Rules: picks MUST come from the list above, best match first, at most 3 picks.
If none plausibly match, return {"picks": []}. Confidence ≥0.85 only when printed details visibly match the candidate image.`,
  })
  let picks: { picks?: { fig_number: string; confidence: number; reason?: string }[] }
  try {
    picks = parseAiJson(await callVision(p, parts))
  } catch (err) {
    return { matches: [], description, model_used: p.model, error: `The AI couldn't compare candidates: ${err instanceof Error ? err.message : err}` }
  }

  const byNum = new Map(candidates.map((c) => [c.set_num, c]))
  const matches: FigMatch[] = []
  for (const pick of (picks.picks ?? []).slice(0, 3)) {
    const cand = byNum.get(pick.fig_number)
    if (!cand) continue // deviated from the list — drop it
    matches.push({ fig_number: cand.set_num, name: cand.name, image_url: cand.set_img_url ?? null, confidence: clamp01(pick.confidence), bricklink_id: null, reason: pick.reason })
  }
  // BrickLink id on the top match makes pricing work immediately (and persists
  // the mapping when the fig is already in the collection)
  if (matches[0]) matches[0].bricklink_id = await soft(() => ensureFigBricklinkId(matches[0].fig_number), null)
  return { matches, description, model_used: p.model }
}

// ── Sets ──────────────────────────────────────────────────────────────────────

async function toRb(s: RebrickableSet): Promise<NonNullable<SetIdentifyResult['rb']>> {
  return { set_num: s.set_num, name: s.name, year: s.year, num_parts: s.num_parts, set_img_url: s.set_img_url, theme: await resolveThemeName(s.theme_id) }
}

/**
 * Set identification is judge-first, never similarity-first. Brickognize's
 * score measures VISUAL SIMILARITY, not correctness (a pile of loose bricks
 * scores 0.95 against the Trash Compactor diorama), so for sets it only ever
 * proposes candidates; an AI judges them against the photo, and the UI always
 * offers the alternatives so you have the final say.
 */
export async function identifySetPhoto(photo: Buffer, opts: { themeHint?: string; contextHint?: string } = {}): Promise<SetIdentifyResult> {
  const { themeHint = '', contextHint = '' } = opts
  const img = prepImage(photo)
  const provider = resolveProvider()

  const bk = await brickognizeSets(img.buffer, img.mediaType)
  const candidates: SetCandidate[] = []
  const inPool = (num: string) => candidates.some((c) => stripSetSuffix(c.set_num) === stripSetSuffix(num))
  for (const item of (bk.ok ? bk.items : []).slice(0, 4)) {
    const s = await soft(() => lookupSet(item.id), null)
    const num = s?.set_num ?? item.id
    if (inPool(num)) continue
    candidates.push({
      set_num: num, name: s?.name ?? item.name, year: s?.year ?? null, num_parts: s?.num_parts ?? null,
      set_img_url: s?.set_img_url ?? item.img_url ?? null, score: clamp01(item.score), source: 'visual',
    })
  }

  if (provider instanceof AppError) {
    // No judge: guesses are presented AS guesses — capped below every trust gate
    const top = candidates[0]
    if (!top) {
      return {
        set_number: null, set_name: null, confidence: 0, notes: null, verified: false, rb: null, candidates: [], model_used: 'none',
        error: bk.ok
          ? "No visual match found. Try a straight-on photo of the box or the finished build. (Loose piles can't be matched to a set.)"
          : `The recognition service is unavailable (${bk.reason}), and no AI is set up as a fallback. Check your connection, or add an AI provider in Settings.`,
      }
    }
    return {
      set_number: top.set_num, set_name: top.name, confidence: Math.min(top.score, 0.45),
      notes: 'Visual similarity only. Nothing has judged this against your photo, so pick the right set below.',
      verified: false, rb: null, candidates, model_used: 'brickognize',
    }
  }
  const p: Provider = provider

  const addSearch = (sets: { set_num: string; name: string; year: number; num_parts: number; set_img_url: string | null }[], cap: number) => {
    for (const s of sets) {
      if (candidates.length >= 12 || cap-- <= 0) return
      if (inPool(s.set_num)) continue
      candidates.push({ set_num: s.set_num, name: s.name, year: s.year, num_parts: s.num_parts, set_img_url: s.set_img_url, score: 0, source: 'search' })
    }
  }

  if (contextHint || themeHint) {
    addSearch(await soft(() => searchSets(contextHint || themeHint), []), 8)
  } else if (hasRebrickableKey()) {
    // SCOUT: name what's IN the photo so its siblings enter the pool (one
    // lookalike from Brickognize is exactly how Jabba's Palace got missed)
    try {
      const scoutPrompt = `Name what this LEGO photo depicts so its official set can be FOUND BY NAME in a catalog.
Return ONLY JSON: {"queries": ["...", "..."], "franchise": "..."}
Rules for queries (1-3 of them, each 1-3 words):
- Words likely to appear in an OFFICIAL SET NAME: character first names, place names, vehicle names ("Jabba", "Throne Room", "Millennium Falcon", "Police Station").
- NEVER a bare franchise ("Star Wars", "Harry Potter") — thousands of sets match.
- NEVER descriptive adjectives ("tan palace", "desert building") — catalogs match names, not descriptions.`
      const scout = parseAiJson<{ queries?: string[] }>(await callVision(p, [{ type: 'image', b64: img.b64, mediaType: img.mediaType, detail: 'low' }, { type: 'text', text: scoutPrompt }]))
      const queries = (scout.queries ?? []).map((q) => String(q).trim()).filter((q) => q && q.split(' ').length <= 3).slice(0, 3)
      let found = 0
      for (const q of queries) {
        const res = await soft(() => searchSets(q, { pageSize: 30, ordering: null }), [])
        found += res.length
        addSearch(res, 3)
      }
      if (found === 0 && queries.length) {
        // Multi-word search is AND; the longest capitalized token alone often lands
        const tokens = queries.join(' ').split(/\s+/).filter((t) => /^[A-Z]/.test(t)).sort((a, b) => b.length - a.length)
        if (tokens[0]) addSearch(await soft(() => searchSets(tokens[0], { pageSize: 30, ordering: null }), []), 4)
      }
    } catch (err) {
      log.warn('[identify] set scout failed (continuing with visual candidates):', err instanceof Error ? err.message : err)
    }
  }

  const promptCands = candidates.map((c) => ({ set_num: c.set_num, name: c.name, year: c.year ?? 0, num_parts: c.num_parts ?? 0 }))
  let data: { set_number?: string | null; set_name?: string; confidence?: number; notes?: string; set_number_visible?: boolean; visible_number?: string | null }
  try {
    const parts: VisionPart[] = [
      { type: 'text', text: buildIdentifyPrompt(themeHint, contextHint, promptCands) },
      { type: 'image', b64: img.b64, mediaType: img.mediaType, detail: 'high' },
    ]
    // Images PER SOURCE — if only visual candidates were pictured, the judge
    // would favor the pictured (maybe wrong) one over a correct text-only one
    const targets = [
      ...candidates.filter((c) => c.source === 'visual').slice(0, 3),
      ...candidates.filter((c) => c.source === 'search').slice(0, 3),
    ]
    const thumbs = await Promise.all(targets.map((c) => fetchThumb(c.set_img_url)))
    let attached = 0
    targets.forEach((c, i) => {
      const t = thumbs[i]
      if (!t) return
      parts.push({ type: 'text', text: `OFFICIAL IMAGE of candidate ${c.set_num} — ${c.name}:` })
      parts.push({ type: 'image', b64: t.b64, mediaType: t.mediaType, detail: 'low' })
      attached++
    })
    if (attached > 0) {
      parts.push({
        type: 'text',
        text: `Compare the FIRST image (the user's photo) against each official candidate image above, detail by detail:
- For your chosen candidate, point to WHERE in its official image each matching detail appears.
- For each REJECTED pictured candidate, name one visible detail that excludes it.
- Shared-scene features do NOT discriminate: arches, a tan palette, a throne dais appear in EVERY version of the same location. Redesigns and sibling sets of one scene exist — being consistent with a candidate is NOT confirmation; look for mismatches.
- The photo may show the BACK or SIDE of the build, or an odd angle — judge by structure, palette, and printed elements, not composition.
- If other sets are visible in the background, identify only the set in FOCUS (foreground, sharpest, most prominent).`,
      })
    }
    data = parseAiJson(await callVision(p, parts))
  } catch (err) {
    return { set_number: null, set_name: null, confidence: 0, notes: null, verified: false, rb: null, candidates, model_used: p.model, error: err instanceof Error ? err.message : String(err) }
  }

  // A number that doesn't resolve in the catalog is a guess, not a match
  let verified = false
  let rb: SetIdentifyResult['rb'] = null
  if (data.set_number) {
    const s = await soft(() => lookupSet(String(data.set_number)), null)
    if (s) { verified = true; rb = await toRb(s) }
  }

  // Confidence discipline, enforced in CODE (a weak judge ignores prompt rules).
  // Exempt only when the judge TRANSCRIBED a readable number matching its answer.
  const numberExempt = data.set_number_visible === true && !!data.visible_number && !!data.set_number
    && stripSetSuffix(String(data.visible_number)) === stripSetSuffix(String(data.set_number))
  let confidence = verified ? clamp01(Number(data.confidence)) : Math.min(0.4, clamp01(Number(data.confidence)))
  if (!numberExempt) {
    // A pool of one has nothing to discriminate against
    if (promptCands.length < 2) confidence = Math.min(confidence, 0.6)
    // An out-of-pool answer that merely resolves is a free-form guess
    const inPoolAnswer = data.set_number && promptCands.some((c) => stripSetSuffix(c.set_num) === stripSetSuffix(String(data.set_number)))
    if (verified && !inPoolAnswer) confidence = Math.min(confidence, 0.6)
  }

  return {
    set_number: data.set_number ? String(data.set_number) : null,
    set_name: (rb?.name ?? data.set_name) || null,
    confidence, notes: data.notes ?? null, verified, rb, candidates,
    set_number_visible: numberExempt, model_used: p.model,
  }
}

function buildIdentifyPrompt(themeHint: string, contextHint: string, candidates: { set_num: string; name: string; year: number; num_parts: number }[]): string {
  const contextBlock = contextHint
    ? `⚠️  SELLER-PROVIDED CONTEXT — THIS IS AUTHORITATIVE:
"${contextHint.replace(/"/g, "'").slice(0, 300)}"
Your identification MUST be consistent with every word above. If the seller names a specific scene, location, vehicle, or event (e.g. "Mos Espa pod race", "trench run", "Eiffel Tower", "Technic truck"), the set you return MUST match those exact terms. Do NOT return a visually similar set that doesn't match the context. If you cannot find a perfect match, lower your confidence rather than ignoring the context.

`
    : ''
  const candidateBlock = candidates.length > 0
    ? `CANDIDATE SETS — real sets from the catalog, gathered from visual similarity and/or the seller's context.
If the correct set is in this list, you MUST return that exact set_number.
Use year and piece count to distinguish similarly-named sets (e.g. UCS vs midscale vs collection pack).
Only deviate if a set number is clearly visible in the image and it contradicts this list.
⚠️ You are the JUDGE, not a rubber stamp: visual-similarity candidates are often wrong
(e.g. a pile of loose bricks "resembles" the Trash Compactor Diorama). If NO candidate
truly matches what you see, reject them all: return "set_number": null with low
confidence and explain in notes. If the photo shows loose/bulk bricks, a partial build,
or a custom MOC rather than an identifiable official set, say exactly that in notes.
${candidates.map((c) => `  • ${c.set_num} — ${c.name}${c.year || c.num_parts ? ` (${c.year || 'year?'}, ${c.num_parts || '?'} pcs)` : ''}`).join('\n')}

`
    : ''
  const themeBlock = themeHint ? `Theme filter: '${themeHint.replace(/'/g, '').slice(0, 60)}' — restrict your search to sets within this theme.\n\n` : ''

  return `You are a world-class LEGO expert and set identifier. Carefully examine the image.

${contextBlock}${candidateBlock}${themeBlock}Analyse clues in this priority order:

0. FOCUS — when several sets are visible (shelf displays, sets around sets),
   identify only the one in focus: foreground, sharpest, most prominent. Ignore
   background sets except as context.

1. CATALOG CANDIDATES (if listed above — highest priority)
   - Pick from the candidate list; use year and piece count to choose between similar names
   - A 220-piece set is NOT the same as a 7,500-piece UCS version of the same ship
   - A "Starship Collection" or "Vehicle Collection" is a small multi-pack, not a large single-vehicle set

2. SELLER CONTEXT (if provided above — must match, never ignore)
   - Every named scene, location, character, or vehicle must appear in the set's official name or description
   - A visually similar set that contradicts the seller context is WRONG — lower confidence instead

3. SET NUMBER
   - Printed on the box, instruction booklet cover, or visible stickers — highest certainty if readable
   - Check EVERYWHERE in frame: a box or booklet off to the side, behind, or partially visible still counts

4. MINIFIGURES (strong signal for named sets)
   - Name every minifigure — outfit, helmet, face print, accessories
   - Exclusive or rare minifigures narrow it to one or very few sets → confidence 0.85+

5. SET FORMAT — distinguish carefully between these types:
   - DIORAMA: flat scene display base, captures one specific moment/location
   - UCS / ULTIMATE COLLECTOR SERIES: large adult-display model, single vehicle, 2000+ pieces
   - MIDSCALE: medium-size vehicle (200–800 pieces), NOT the flagship UCS version of the same ship
   - VEHICLE / STARSHIP COLLECTION / PACK: multiple small vehicles in one box, typically under 300 pieces total
   - PLAYSET: functional environment with characters and play features

6. DISTINCTIVE BUILD FEATURES — unique shapes, colour schemes, structural elements specific to one set

7. TEXT / BRANDING — any visible text, logos, ship names, location names

IMPORTANT: Provide your best guess when the photo plausibly shows one identifiable set.
When it does NOT (loose bricks, mixed lot, partial build, custom MOC, no LEGO content),
return "set_number": null with confidence 0.1 or lower and say why in notes — a wrong
confident answer is far worse than an honest "can't tell".

Return ONLY a valid JSON object — no markdown, no extra text:
{"set_number": "75380", "set_name": "Mos Espa Podrace Diorama", "confidence": 0.92, "set_number_visible": false, "visible_number": null, "notes": "Podrace scene, sandy desert base, Anakin's pod visible"}

set_number: official LEGO set number, digits only, no -1 suffix.
set_name: full official name.
confidence: 0.0–1.0.
set_number_visible: true ONLY if a printed set number is actually readable somewhere in the photo (box, booklet, sticker).
visible_number: the digits you can actually read, transcribed exactly — null if none. Never claim a number you cannot transcribe.
notes: the specific clues used — minifigures spotted, text seen, format identified, and whether context and candidates matched.`
}

// ── Group photos ──────────────────────────────────────────────────────────────

/**
 * Bounding boxes for each minifigure in a group photo. Falls back to one
 * whole-image box on any failure, so a split scan is never worse than an
 * unsplit one. Needs an AI provider; without one, nothing is split.
 */
export async function detectFigBoxes(photo: Buffer): Promise<Box[]> {
  const whole = [{ x: 0, y: 0, w: 1, h: 1 }]
  const p = resolveProvider()
  if (p instanceof AppError) return whole
  try {
    const img = prepImage(photo)
    const prompt = `Count the distinct LEGO minifigures in this image and give a bounding box for each.
Return ONLY JSON: {"boxes": [{"x": 0.0-1.0, "y": 0.0-1.0, "w": 0.0-1.0, "h": 0.0-1.0}]}
x,y = top-left corner as fractions of image width/height; w,h = box size as fractions.
Boxes should generously contain each full figure. If there is exactly one figure (or none), return one box covering it (or the whole image).`
    const data = parseAiJson<{ boxes?: Box[] }>(await callVision(p, [{ type: 'image', b64: img.b64, mediaType: img.mediaType, detail: 'high' }, { type: 'text', text: prompt }]))
    const boxes = (data.boxes ?? []).filter((b) =>
      [b.x, b.y, b.w, b.h].every((v) => typeof v === 'number' && v >= 0 && v <= 1) && b.w > 0.02 && b.h > 0.02)
    return boxes.length >= 2 ? boxes.slice(0, 12) : whole
  } catch {
    return whole
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────────

/** One piece per photo works best: Brickognize's part model first, AI as fallback. */
export async function identifyPiece(photo: Buffer): Promise<PieceIdentifyResult> {
  const img = prepImage(photo)
  const bk = await brickognizeParts(img.buffer, img.mediaType)
  if (bk.ok && bk.items[0] && bk.items[0].score >= BRICKOGNIZE_TRUST) {
    return {
      pieces: bk.items.slice(0, 4).map((i) => ({
        name: i.name, part_number: i.id, color: null, confidence: clamp01(i.score),
        bricklink_url: bricklinkCatalogUrl('P', i.id), img_url: i.img_url ?? null,
      })),
      model_used: 'brickognize',
    }
  }
  const p = resolveProvider()
  if (p instanceof AppError) {
    return {
      pieces: (bk.ok ? bk.items : []).slice(0, 4).map((i) => ({
        name: i.name, part_number: i.id, color: null, confidence: Math.min(clamp01(i.score), 0.45),
        bricklink_url: bricklinkCatalogUrl('P', i.id), img_url: i.img_url ?? null,
      })),
      model_used: bk.ok ? 'brickognize' : 'none',
      error: bk.ok
        ? 'No confident match. Center one piece on a plain background, or add an AI provider in Settings for a second opinion.'
        : `The recognition service is unavailable (${bk.reason}), and no AI is set up as a fallback.`,
    }
  }
  try {
    const prompt = 'Identify all LEGO pieces visible in this image. Respond with ONLY a JSON array of objects with keys: name (string), part_number (string or null — ONLY give a part_number you are sure of, null otherwise), color (string), confidence (0-1).'
    const items = parseAiJson<Record<string, unknown>[]>(await callVision(p, [{ type: 'image', b64: img.b64, mediaType: img.mediaType, detail: 'high' }, { type: 'text', text: prompt }]))
    return {
      pieces: (Array.isArray(items) ? items : []).slice(0, 8).map((item) => {
        const part = typeof item.part_number === 'string' && item.part_number.trim() ? item.part_number.trim() : null
        return {
          name: String(item.name ?? 'Unknown part'), part_number: part,
          color: typeof item.color === 'string' ? item.color : null,
          confidence: clamp01(Number(item.confidence ?? 0.6)),
          bricklink_url: part ? bricklinkCatalogUrl('P', part) : null, img_url: null,
        }
      }),
      model_used: p.model,
    }
  } catch (err) {
    return { pieces: [], model_used: p.model, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Photographed lists (import) ──────────────────────────────────────────────

/** A photo of a written or printed list of set numbers → rows for review. */
export async function readListPhoto(photo: Buffer): Promise<{ rows: (ImportItem & { confidence: number; raw?: string })[] }> {
  const p = resolveProvider()
  if (p instanceof AppError) throw p
  const img = prepImage(photo)
  const prompt = `This image shows a LIST of LEGO items — handwritten notes, a printed inventory, a spreadsheet screenshot, or similar. Each line usually contains a LEGO set number (3-7 digits, most commonly 4-5, e.g. 75192, 10030) and sometimes a quantity ("x2", "(3)", "qty 2", "2x"). Lines may instead contain BrickLink minifig IDs (2-6 letters + digits, e.g. sw0380, njo123).

Extract EVERY row you can read. Return ONLY JSON (no markdown):
{"rows": [{"number": "75192", "kind": "set", "quantity": 1, "confidence": 0.95, "raw": "the text as written"}]}

Rules:
- kind: "minifig" only when the id is letters+digits (sw0380 style); digit-only numbers are "set".
- quantity: 1 unless a quantity is clearly written next to the item.
- confidence: how certain you are of the digits (handwriting can be ambiguous — 4 vs 9, 1 vs 7).
- raw: the original text of the line so the user can double-check ambiguous reads.
- Skip lines with no plausible LEGO id. If the image contains no list at all, return {"rows": []}.`
  const data = parseAiJson<{ rows?: { number?: unknown; kind?: unknown; quantity?: unknown; confidence?: unknown; raw?: unknown }[] }>(
    await callVision(p, [{ type: 'image', b64: img.b64, mediaType: img.mediaType, detail: 'high' }, { type: 'text', text: prompt }]),
  )
  return {
    rows: (data.rows ?? [])
      .filter((r) => r && typeof r.number === 'string' && r.number.trim())
      .map((r) => ({
        kind: r.kind === 'minifig' ? 'minifig' as const : 'set' as const,
        number: String(r.number).trim(),
        quantity: Math.max(1, Math.min(999, Number(r.quantity) || 1)),
        wanted: false,
        confidence: clamp01(Number(r.confidence ?? 0.5)),
        raw: typeof r.raw === 'string' ? r.raw.slice(0, 120) : undefined,
      })),
  }
}
