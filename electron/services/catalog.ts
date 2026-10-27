/**
 * Catalog → collection: adding items by number, the Rebrickable ↔ BrickLink
 * minifig id bridge, and background enrichment (themes, years, names) that
 * fills gaps without ever blocking an add.
 */
import { AppError } from '../../src/lib/errors'
import { isRebrickableFigNumber } from '../../src/lib/lego-ids'
import type { AddOptions, AddResult, LegoSet, Minifigure, CatalogSetDetail, DataHealth } from '../../src/lib/types'
import log from '../main/logger'
import {
  lookupSet, inspectSet as rbInspectSet, resolveThemeName, getMinifig, getMinifigDetails, getMinifigSets, hasRebrickableKey,
} from '../api/rebrickable'
import { brickognizeFigs } from '../api/brickognize'
import { fetchImage } from './images'
import { getBricklinkItem, getBricklinkSetMinifigs, hasBricklinkCredentials, bricklinkImageUrl, type BricklinkSetFig } from '../api/bricklink'
import {
  addSet, addFig, findFig, getSetByNumber, setSetTheme, setFigDetails, listSetsMissingTheme, rememberFigId, rememberedFigId, rememberedFigIds,
  listFigsMissingBricklinkId, listFigsMissingDetails, listFigsMissingName, type FigCatalogFields,
} from '../db/queries/collection.queries'
import { IPC } from '../../src/lib/ipc-types'
import { push } from './notify'

const STOP = new Set(['the', 'and', 'with', 'of', 'an'])
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 2 && !STOP.has(w))

function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false
  // One edit apart (catalog spellings differ: "Kuill" vs "Kuiil")
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

function overlap(words: string[], pool: string[]): number {
  if (!words.length) return 0
  return words.filter((w) => pool.some((p) => nearlyEqual(w, p))).length / words.length
}

/**
 * Do a Rebrickable and a BrickLink minifig name describe the same figure?
 * The character (before the first comma) must match AND the variant details
 * must mostly agree — "AT-AT Driver, Sand Blue Uniform" is not the
 * "AT-AT Driver - Dark Red Imperial Logo" variant. A strong visual score lets
 * differently-worded names through when most details agree.
 */
export function namesAgree(rebrickableName: string, bricklinkName: string, score = 0): boolean {
  const head = tokens(rebrickableName.split(',')[0])
  const full = tokens(rebrickableName)
  const bl = tokens(bricklinkName)
  return (overlap(head, bl) >= 0.5 && overlap(full, bl) > 0.4) || (score >= 0.6 && overlap(full, bl) >= 0.6)
    // A very strong visual match needs only half the words to agree: the two
    // catalogs word details differently, and BrickLink often leaves some out
    // ("Castle Man, Reddish Brown Apron, Dark Brown Hair" is BrickLink's
    // "Tavern Keeper - Male, Reddish Brown Apron", hair not mentioned)
    || (score >= 0.8 && overlap(full, bl) >= 0.5)
}

/**
 * Of a set's figures, the one a Rebrickable name describes, or null when the
 * name can't tell them apart. The character (before the first comma) must
 * match first; among the figures that do, each shared word counts more the
 * fewer of them have it. So "Hammer" decides between two clone troopers, and
 * "Sand Blue" alone doesn't make General Veers an AT-AT Driver.
 */
export function pickByName(name: string, pool: { no: string; name: string }[]): string | null {
  const has = (words: string[], w: string) => words.some((x) => nearlyEqual(w, x))
  const words = pool.map((f) => [...new Set(tokens(f.name))])
  const head = [...new Set(tokens(name.split(',')[0]))]
  const same = pool.map((_, i) => i).filter((i) => head.filter((w) => has(words[i], w)).length >= head.length / 2)
  const pick = same.length ? same : pool.map((_, i) => i)
  const mine = [...new Set(tokens(name))]
  const sharedBy = (w: string) => pick.filter((i) => has(words[i], w)).length
  const ranked = pick
    .map((i) => ({ no: pool[i].no, score: mine.reduce((sum, w) => sum + (has(words[i], w) ? 1 / sharedBy(w) : 0), 0) }))
    .sort((x, y) => y.score - x.score)
  const best = ranked[0]?.score ?? 0
  return best >= 1 && best >= 2 * (ranked[1]?.score ?? 0) ? ranked[0].no : null
}

/**
 * The BrickLink figures a Rebrickable figure could be: the minifigures in the
 * BrickLink inventories of the sets it comes in. The figure is in every one
 * of those sets, so the pool narrows to the ids they share. Empty without
 * BrickLink keys or when BrickLink doesn't know the sets.
 */
async function setInventoryPool(figNumber: string): Promise<BricklinkSetFig[]> {
  if (!hasBricklinkCredentials()) return []
  // Errors (throttled, offline, a bad key) are not "no match": they propagate, so
  // nothing is remembered and the lookup runs again later
  const sets = (await getMinifigSets(figNumber)).slice(0, 4)
  const lists: BricklinkSetFig[][] = []
  for (const s of sets) {
    const figs = await getBricklinkSetMinifigs(s.set_num) // null: BrickLink doesn't know the set
    if (figs?.length) lists.push(figs)
  }
  let pool = lists[0] ?? []
  for (const list of lists.slice(1)) {
    const ids = new Set(list.map((f) => f.no))
    const shared = pool.filter((f) => ids.has(f.no))
    if (shared.length) pool = shared
  }
  return pool
}

/**
 * THE fig id bridge: find a Rebrickable minifig's BrickLink id; the caller's
 * row then moves to that id (BrickLink ids are the collection's keys).
 * Rebrickable doesn't publish BrickLink ids for minifigs, so:
 *  1. Its sets' BrickLink inventories: one shared figure is the answer, and
 *     among several the name decides when one clearly fits (pickByName).
 *  2. Brickognize, shown the fig's official picture: within that pool it only
 *     has to tell the pool's figures apart; without a pool it must be
 *     confident or agree on the name.
 * BrickLink ids pass through.
 */
export async function ensureFigBricklinkId(figNumber: string, opts: { visual?: boolean; name?: string } = {}): Promise<string | null> {
  if (!isRebrickableFigNumber(figNumber)) return figNumber
  const visual = opts.visual ?? true
  let blId = rememberedFigId(figNumber)
  // Without the picture step, a name from a search result saves a lookup
  const fig = blId || (!visual && opts.name) ? null : await getMinifig(figNumber)
  if (!blId && fig) blId = fig.external_ids?.BrickLink?.[0] ?? null
  const name = opts.name ?? fig?.name ?? null
  const pool = blId || !name ? [] : await setInventoryPool(figNumber)
  if (!blId && name && pool.length) {
    blId = pool.length === 1 ? pool[0].no : pickByName(name, pool)
  }
  if (!blId && visual && fig) {
    const img = await fetchImage(fig.set_img_url)
    if (img) {
      const bk = await brickognizeFigs(img.buffer, img.mediaType)
      const items = bk.ok ? bk.items : []
      const inPool = new Set(pool.map((f) => f.no))
      const top = inPool.size ? items.find((i) => inPool.has(i.id) && i.score >= 0.3) : items[0]
      if (top && (inPool.size || top.score >= 0.9 || (top.score >= 0.45 && namesAgree(fig.name, top.name, top.score)))) blId = top.id
    }
  }
  rememberFigId(figNumber, blId)
  if (blId) setFigDetails(figNumber, { bricklink_id: blId })
  return blId
}

// ── BrickLink ids for search results ──────────────────────────────────────────

const pendingIds: { id: string; name: string }[] = []
let draining = false

/**
 * BrickLink ids for catalog search results (Rebrickable is the only catalog
 * that can be searched, so results arrive under Rebrickable numbers). Known
 * ones come back at once; the rest are looked up one at a time in the
 * background, through set inventories only, and announced on PUSH_FIG_IDS.
 */
export function figIdsForResults(results: { id: string; name: string }[]): Record<string, string | null> {
  const figs = results.filter((r) => isRebrickableFigNumber(r.id)).slice(0, 60)
  const known = rememberedFigIds(figs.map((f) => f.id))
  if (hasBricklinkCredentials() && hasRebrickableKey()) {
    // The latest search goes first; an old one's leftovers wait or drop off
    for (const f of [...figs].reverse()) {
      if (f.id in known) continue
      const i = pendingIds.findIndex((p) => p.id === f.id)
      if (i !== -1) pendingIds.splice(i, 1)
      pendingIds.unshift(f)
    }
    pendingIds.splice(80)
    void drainPendingIds()
  }
  return known
}

async function drainPendingIds(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (pendingIds.length) {
      const { id, name } = pendingIds.shift()!
      try {
        const bl = await ensureFigBricklinkId(id, { visual: false, name })
        push(IPC.PUSH_FIG_IDS, { rebrickable_id: id, bricklink_id: bl })
      } catch (err) {
        // Bad keys, offline, or rate-limited: stop; the next search starts again
        if (err instanceof AppError && ['auth', 'missing_key', 'network', 'rate_limited'].includes(err.code)) {
          pendingIds.length = 0
          break
        }
        log.warn(`[fig-ids] ${id}:`, err instanceof Error ? err.message : err)
      }
    }
  } finally {
    draining = false
  }
}

/** Add a set by its number. Known sets skip the network round trip. */
export async function addSetByNumber(setNumber: string, opts: AddOptions): Promise<AddResult<LegoSet>> {
  const raw = setNumber.trim()
  if (!/^[\w.-]{2,20}$/.test(raw)) throw new AppError({ code: 'invalid_input', message: `"${raw}" doesn't look like a set number.` })
  const num = raw.includes('-') ? raw : `${raw}-1`
  const local = getSetByNumber(num)
  if (local) {
    return addSet({
      set_number: local.set_number, name: local.name, year: local.year, theme: local.theme,
      piece_count: local.piece_count, image_url: local.image_url, rebrickable_url: local.rebrickable_url,
    }, opts)
  }
  const s = await lookupSet(num)
  if (!s) throw new AppError({ code: 'not_found', service: 'rebrickable', message: `Set ${raw} isn't in the Rebrickable catalog. Check the number.` })
  return addSet({
    set_number: s.set_num, name: s.name, year: s.year, theme: await resolveThemeName(s.theme_id),
    piece_count: s.num_parts, image_url: s.set_img_url, rebrickable_url: s.set_url,
  }, opts)
}

/** Add a minifig from catalog data; the id bridge and details land in the background. */
export function addFigFromCatalog(fig: FigCatalogFields, opts: AddOptions): AddResult<Minifigure> {
  const result = addFig(fig, opts)
  void enrichFig(result.item.rebrickable_id ?? result.item.fig_number).catch(() => undefined)
  return result
}

/** Rebrickable details for a fig added from Rebrickable, and its BrickLink id if it still needs one. */
async function enrichFig(figNumber: string): Promise<void> {
  if (!isRebrickableFigNumber(figNumber) || !hasRebrickableKey()) return
  if (!findFig(figNumber)?.bricklink_id) await ensureFigBricklinkId(figNumber)
  const d = await getMinifigDetails(figNumber)
  setFigDetails(figNumber, { year: d.year, theme: await resolveThemeName(d.themeId) })
  push(IPC.PUSH_DATA_CHANGED, { kind: 'minifig' })
}

/**
 * A set and its minifigures. With BrickLink keys the figures come from the
 * set's BrickLink inventory, already under their BrickLink ids; otherwise
 * from Rebrickable, to be matched to BrickLink ids after they're added.
 */
export async function inspectSet(setNumber: string): Promise<CatalogSetDetail> {
  const res = await rbInspectSet(setNumber)
  if (!res) throw new AppError({ code: 'not_found', service: 'rebrickable', message: `Set ${setNumber} isn't in the Rebrickable catalog.` })
  const bl = hasBricklinkCredentials() ? await getBricklinkSetMinifigs(res.set.set_num).catch(() => null) : null
  const minifigs = bl
    ? bl.map((f) => ({ set_num: f.no, set_name: f.name, quantity: f.quantity, set_img_url: bricklinkImageUrl('M', f.no), bricklink_id: f.no }))
    : res.minifigs
  return { set: res.set, theme: await resolveThemeName(res.set.theme_id), minifigs }
}

// ── Background enrichment ─────────────────────────────────────────────────────

export function dataHealth(): DataHealth {
  return {
    figsMissingBlId: listFigsMissingBricklinkId().length,
    figsMissingDetails: listFigsMissingDetails().length + listFigsMissingName().length,
    setsMissingTheme: listSetsMissingTheme().length,
  }
}

let enriching: Promise<{ fixed: number }> | null = null

/**
 * Fill catalog gaps across the collection: set themes, minifig BrickLink ids,
 * debut years and themes, and names for minifigs imported by BrickLink id.
 * One run at a time; each item is independent, so one failure skips one item.
 */
export function enrichCollection(): Promise<{ fixed: number }> {
  enriching ??= (async () => {
    let fixed = 0
    const step = async (label: string, fn: () => Promise<boolean>) => {
      try { if (await fn()) fixed++ } catch (err) {
        if (err instanceof AppError && (err.code === 'missing_key' || err.code === 'auth' || err.code === 'network')) throw err
        log.warn(`[enrich] ${label}:`, err instanceof Error ? err.message : err)
      }
    }
    try {
      if (hasRebrickableKey()) {
        for (const { set_number } of listSetsMissingTheme()) {
          await step(set_number, async () => {
            const s = await lookupSet(set_number)
            const theme = s ? await resolveThemeName(s.theme_id) : null
            if (theme) setSetTheme(set_number, theme)
            return !!theme
          })
        }
        for (const { fig_number } of listFigsMissingBricklinkId()) {
          await step(fig_number, async () => !!(await ensureFigBricklinkId(fig_number)))
        }
        for (const { fig_number } of listFigsMissingDetails()) {
          await step(fig_number, async () => {
            const d = await getMinifigDetails(fig_number)
            const theme = await resolveThemeName(d.themeId)
            setFigDetails(fig_number, { year: d.year, theme })
            return !!(d.year || theme)
          })
        }
      }
      for (const { fig_number } of listFigsMissingName()) {
        await step(fig_number, async () => {
          // BrickLink knows its own ids; without keys, at least show the picture
          const item = hasBricklinkCredentials() ? await getBricklinkItem('MINIFIG', fig_number) : null
          setFigDetails(fig_number, {
            name: item?.name ?? null,
            image_url: item?.image_url ?? bricklinkImageUrl('M', fig_number),
            year: item?.year_released ?? null,
          })
          return !!item
        })
      }
    } catch (err) {
      log.info('[enrich] stopped early:', err instanceof Error ? err.message : err)
    }
    if (fixed) {
      log.info(`[enrich] filled in ${fixed} item(s)`)
      push(IPC.PUSH_DATA_CHANGED, { kind: 'all' })
    }
    return { fixed }
  })().finally(() => { enriching = null })
  return enriching
}
