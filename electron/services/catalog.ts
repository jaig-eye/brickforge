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
  lookupSet, inspectSet as rbInspectSet, resolveThemeName, getMinifig, getMinifigBricklinkIds, getMinifigDetails, hasRebrickableKey,
} from '../api/rebrickable'
import { brickognizeFigs } from '../api/brickognize'
import { fetchImage } from './images'
import { getBricklinkItem, hasBricklinkCredentials, bricklinkImageUrl } from '../api/bricklink'
import {
  addSet, addFig, getSetByNumber, setSetTheme, setFigDetails, listSetsMissingTheme,
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
 * THE fig id bridge: find a Rebrickable minifig's BrickLink id and persist it
 * (plus its catalog link). Rebrickable's API doesn't publish BrickLink ids for
 * minifigs, so the bridge shows the fig's OFFICIAL catalog image to
 * Brickognize (which answers in BrickLink ids) and accepts the match only
 * when it's confident or the names agree. BrickLink ids pass through.
 */
export async function ensureFigBricklinkId(figNumber: string): Promise<string | null> {
  if (!isRebrickableFigNumber(figNumber)) return figNumber
  const listed = await getMinifigBricklinkIds(figNumber).catch(() => [])
  let blId: string | null = listed[0] ?? null
  if (!blId) {
    const fig = await getMinifig(figNumber)
    const img = await fetchImage(fig?.set_img_url)
    if (fig && img) {
      const bk = await brickognizeFigs(img.buffer, img.mediaType)
      const top = bk.ok ? bk.items[0] : undefined
      if (top && (top.score >= 0.9 || (top.score >= 0.45 && namesAgree(fig.name, top.name, top.score)))) blId = top.id
    }
  }
  if (blId) setFigDetails(figNumber, { bricklink_id: blId })
  return blId
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
  void enrichFig(result.item.fig_number).catch(() => undefined)
  return result
}

async function enrichFig(figNumber: string): Promise<void> {
  if (!isRebrickableFigNumber(figNumber) || !hasRebrickableKey()) return
  await ensureFigBricklinkId(figNumber)
  const d = await getMinifigDetails(figNumber)
  setFigDetails(figNumber, { year: d.year, theme: await resolveThemeName(d.themeId) })
  push(IPC.PUSH_DATA_CHANGED, { kind: 'minifig' })
}

export async function inspectSet(setNumber: string): Promise<CatalogSetDetail> {
  const res = await rbInspectSet(setNumber)
  if (!res) throw new AppError({ code: 'not_found', service: 'rebrickable', message: `Set ${setNumber} isn't in the Rebrickable catalog.` })
  return { set: res.set, theme: await resolveThemeName(res.set.theme_id), minifigs: res.minifigs }
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
