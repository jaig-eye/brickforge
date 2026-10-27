/**
 * Rebrickable API client — the free LEGO catalog (sets, minifigs, themes).
 * Docs: https://rebrickable.com/api/v3/docs/
 *
 * Every request flows through one throttled queue (min gap between calls)
 * with retry + backoff on 429/5xx, so bulk work (imports, backfills, batch
 * identification) can't trip Rebrickable's rate limit. This module only talks
 * to Rebrickable; writing results into the collection is the caller's job.
 */
import { readSettings } from '../main/settings-store'
import { missingKey } from '../../src/lib/errors'
import { request, serviceUrl, statusError } from './http'

const MIN_GAP_MS = 350        // ~3 req/s ceiling
const base = () => serviceUrl('rebrickable', 'https://rebrickable.com/api/v3/lego')

function apiKey(): string {
  return readSettings().rebrickableApiKey || process.env.REBRICKABLE_API_KEY || ''
}

export function hasRebrickableKey(): boolean {
  return apiKey().length > 0
}

// ── Throttled request queue ───────────────────────────────────────────────────

let queueTail: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** GET a catalog endpoint. Resolves null on 404; throws AppError otherwise. */
function get<T>(endpoint: string, params: Record<string, string> = {}, key = apiKey()): Promise<T | null> {
  const run = async (): Promise<T | null> => {
    if (!key) throw missingKey('rebrickable', 'a free Rebrickable API key')
    const wait = lastRequestAt + MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    const qs = new URLSearchParams(params).toString()
    const res = await request('rebrickable', `${base()}${endpoint}${qs ? `?${qs}` : ''}`, {
      headers: { Accept: 'application/json', Authorization: `key ${key}` },
      timeoutMs: 15_000,
      retries: 3,
    })
    if (res.status === 404) return null
    if (res.status !== 200) throw statusError('rebrickable', res.status, res.text())
    return res.json<T>()
  }
  // Serialize so concurrent callers still respect MIN_GAP_MS
  const next = queueTail.then(run, run)
  queueTail = next.catch(() => undefined)
  return next
}

/** Validate a key without saving it (Settings → Test connection). */
export async function testRebrickableKey(key: string): Promise<void> {
  await get('/themes/', { page_size: '1' }, key)
}

export interface RebrickableSet {
  set_num: string
  name: string
  year: number
  theme_id: number
  num_parts: number
  set_img_url: string | null
  set_url: string
  last_modified_dt: string
}

export interface RebrickableSetMinifig {
  id: number
  set_num: string        // the fig's number, e.g. "fig-000123"
  set_name: string
  quantity: number
  set_img_url: string | null
}

export interface RebrickableMinifig {
  set_num: string        // fig number: "fig-000123"
  name: string
  num_parts: number
  set_img_url: string | null
  set_url?: string
}

export interface RebrickableTheme {
  id: number
  parent_id: number | null
  name: string
}

export interface BrowseOpts {
  search?: string
  theme_id?: number | null
  page?: number
  page_size?: number
  ordering?: string
  /** Hide books, gear, and other 0-piece catalog entries. Default true. */
  setsOnly?: boolean
}

export interface Page<T> {
  count: number
  results: T[]
}

const normSetNum = (n: string) => (n.includes('-') ? n : `${n}-1`)

// ── Themes ────────────────────────────────────────────────────────────────────

let themeCache: Map<number, RebrickableTheme> | null = null

export async function getThemes(): Promise<RebrickableTheme[]> {
  if (themeCache) return [...themeCache.values()].sort((a, b) => a.name.localeCompare(b.name))
  const res = await get<Page<RebrickableTheme>>('/themes/', { page_size: '1000' })
  const themes = res?.results ?? []
  if (themes.length) themeCache = new Map(themes.map((t) => [t.id, t]))
  return [...themes].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * A theme id → its ROOT theme's name, for grouping ("Star Wars Episode I" →
 * "Star Wars"). Null when unknown; never throws, because a theme is a nicety
 * that must not block anything.
 */
export async function resolveThemeName(themeId: number | null | undefined): Promise<string | null> {
  if (!themeId) return null
  try {
    if (!themeCache) await getThemes()
    let t = themeCache?.get(themeId)
    for (let hops = 0; t?.parent_id != null && hops < 6; hops++) {
      const parent = themeCache?.get(t.parent_id)
      if (!parent) break
      t = parent
    }
    return t?.name ?? null
  } catch {
    return null
  }
}

// ── Sets ──────────────────────────────────────────────────────────────────────

export function lookupSet(setNum: string): Promise<RebrickableSet | null> {
  return get<RebrickableSet>(`/sets/${encodeURIComponent(normSetNum(setNum.trim()))}/`)
}

export async function searchSets(query: string, opts: { pageSize?: number; ordering?: string | null; setsOnly?: boolean } = {}): Promise<RebrickableSet[]> {
  const params: Record<string, string> = { search: query, page_size: String(opts.pageSize ?? 20) }
  // Scout searches pass ordering: null — '-year' pushes retired sets (the
  // ones people actually scan for resale) off page one for popular terms.
  if (opts.ordering !== null) params.ordering = opts.ordering ?? '-year'
  if (opts.setsOnly !== false) params.min_parts = '1'
  return (await get<Page<RebrickableSet>>('/sets/', params))?.results ?? []
}

export async function browseSets(opts: BrowseOpts = {}): Promise<Page<RebrickableSet>> {
  const params: Record<string, string> = {
    page: String(opts.page ?? 1),
    page_size: String(opts.page_size ?? 30),
    ordering: opts.ordering ?? '-year',
  }
  if (opts.search?.trim()) params.search = opts.search.trim()
  if (opts.theme_id) params.theme_id = String(opts.theme_id)
  if (opts.setsOnly !== false) params.min_parts = '1'
  return (await get<Page<RebrickableSet>>('/sets/', params)) ?? { count: 0, results: [] }
}

export async function getSetMinifigs(setNum: string): Promise<RebrickableSetMinifig[]> {
  const res = await get<Page<RebrickableSetMinifig>>(`/sets/${encodeURIComponent(normSetNum(setNum))}/minifigs/`, { page_size: '100' })
  return res?.results ?? []
}

/** A set plus the minifigures that come in it. Null when the set doesn't exist. */
export async function inspectSet(setNum: string): Promise<{ set: RebrickableSet; minifigs: RebrickableSetMinifig[] } | null> {
  const set = await lookupSet(setNum)
  if (!set) return null
  return { set, minifigs: await getSetMinifigs(set.set_num) }
}

// ── Minifigures ───────────────────────────────────────────────────────────────

export async function browseMinifigs(opts: BrowseOpts = {}): Promise<Page<RebrickableMinifig>> {
  const params: Record<string, string> = {
    page: String(opts.page ?? 1),
    page_size: String(opts.page_size ?? 30),
    ordering: opts.ordering ?? 'name',
  }
  if (opts.search?.trim()) params.search = opts.search.trim()
  if (opts.theme_id) params.in_theme_id = String(opts.theme_id)
  return (await get<Page<RebrickableMinifig>>('/minifigs/', params)) ?? { count: 0, results: [] }
}

export async function searchMinifigs(query: string, pageSize = 20): Promise<RebrickableMinifig[]> {
  return (await get<Page<RebrickableMinifig>>('/minifigs/', { search: query, page_size: String(pageSize) }))?.results ?? []
}

export function getMinifig(figNum: string): Promise<(RebrickableMinifig & { external_ids?: { BrickLink?: string[] } }) | null> {
  return get(`/minifigs/${encodeURIComponent(figNum)}/`)
}

/** Sets a fig appears in, newest first. */
export async function getMinifigSets(figNum: string): Promise<RebrickableSet[]> {
  const res = await get<Page<RebrickableSet>>(`/minifigs/${encodeURIComponent(figNum)}/sets/`, { page_size: '100', ordering: '-year' })
  return res?.results ?? []
}

/** A fig's debut year and a theme, from the sets it appears in. */
export async function getMinifigDetails(figNum: string): Promise<{ year: number | null; themeId: number | null }> {
  const sets = await getMinifigSets(figNum)
  if (!sets.length) return { year: null, themeId: null }
  const years = sets.map((s) => s.year).filter((y) => typeof y === 'number' && y > 0)
  return { year: years.length ? Math.min(...years) : null, themeId: sets[sets.length - 1].theme_id ?? null }
}
