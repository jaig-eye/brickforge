/**
 * Rebrickable API client — free LEGO database.
 * Docs: https://rebrickable.com/api/v3/docs/
 */
import https from 'https'
import log from '../main/logger'
import { upsertSet, type LegoSet } from '../db/queries/collection.queries'

const BASE = 'https://rebrickable.com/api/v3/lego'

function getApiKey(): string {
  try {
    const fs = require('fs')
    const path = require('path')
    const { app } = require('electron')
    const settings = JSON.parse(
      fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')
    )
    return settings.rebrickableApiKey ?? ''
  } catch {
    return process.env.REBRICKABLE_API_KEY ?? ''
  }
}

function get<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ ...params, key: getApiKey() }).toString()
    const url = `${BASE}${endpoint}?${qs}`
    https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Rebrickable ${res.statusCode}: ${data}`))
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`)) }
      })
    }).on('error', reject)
  })
}

export interface RebrickableSet {
  set_num: string
  name: string
  year: number
  theme_id: number
  num_parts: number
  set_img_url: string
  set_url: string
  last_modified_dt: string
}

export interface RebrickableMinifig {
  id: number
  set_num: string
  set_name: string
  quantity: number
  set_img_url: string
}

export interface RebrickableMinifigCatalog {
  set_num: string   // fig_number, e.g. "sw0001"
  name: string
  num_parts: number
  set_img_url: string
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
}

interface RebrickableListResponse<T> {
  count: number
  results: T[]
}

/** Look up a single set by number without saving to the database. */
export async function lookupRebrickableSet(setNum: string): Promise<RebrickableSet | null> {
  const normalised = setNum.includes('-') ? setNum : `${setNum}-1`
  try {
    return await get<RebrickableSet>(`/sets/${normalised}/`)
  } catch (err) {
    log.error('[Rebrickable] lookup failed:', err)
    return null
  }
}

export async function searchRebrickableSets(query: string): Promise<RebrickableSet[]> {
  try {
    const res = await get<RebrickableListResponse<RebrickableSet>>('/sets/', {
      search: query,
      page_size: '20',
      ordering: '-year',
    })
    return res.results
  } catch (err) {
    log.error('[Rebrickable] search failed:', err)
    return []
  }
}

/** Get the total minifigure count for a set (sum of quantities across all minifigs). */
export async function getSetMinifigCount(setNum: string): Promise<number> {
  const normalised = setNum.includes('-') ? setNum : `${setNum}-1`
  try {
    const res = await get<RebrickableListResponse<RebrickableMinifig>>(`/sets/${normalised}/minifigs/`, { page_size: '100' })
    return res.results.reduce((sum, fig) => sum + fig.quantity, 0)
  } catch (err) {
    log.error('[Rebrickable] getSetMinifigCount failed:', err)
    return 0
  }
}

export async function browseRebrickableSets(opts: BrowseOpts = {}): Promise<{ count: number; results: RebrickableSet[] }> {
  try {
    const params: Record<string, string> = {
      page: String(opts.page ?? 1),
      page_size: String(opts.page_size ?? 24),
      ordering: opts.ordering ?? '-year',
    }
    if (opts.search?.trim()) params.search = opts.search.trim()
    if (opts.theme_id) params.theme_id = String(opts.theme_id)
    const res = await get<RebrickableListResponse<RebrickableSet>>('/sets/', params)
    return { count: res.count, results: res.results }
  } catch (err) {
    log.error('[Rebrickable] browseRebrickableSets failed:', err)
    return { count: 0, results: [] }
  }
}

export async function browseRebrickableMinifigs(opts: BrowseOpts = {}): Promise<{ count: number; results: RebrickableMinifigCatalog[] }> {
  try {
    const params: Record<string, string> = {
      page: String(opts.page ?? 1),
      page_size: String(opts.page_size ?? 24),
      ordering: opts.ordering ?? 'name',
    }
    if (opts.search?.trim()) params.search = opts.search.trim()
    if (opts.theme_id) params.in_theme_id = String(opts.theme_id)
    const res = await get<RebrickableListResponse<RebrickableMinifigCatalog>>('/minifigs/', params)
    return { count: res.count, results: res.results }
  } catch (err) {
    log.error('[Rebrickable] browseRebrickableMinifigs failed:', err)
    return { count: 0, results: [] }
  }
}

export async function getThemes(): Promise<RebrickableTheme[]> {
  try {
    const res = await get<RebrickableListResponse<RebrickableTheme>>('/themes/', { page_size: '1000' })
    return res.results.sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    log.error('[Rebrickable] getThemes failed:', err)
    return []
  }
}

export interface SetDetailResult {
  set: RebrickableSet
  minifigs: { set_num: string; set_name: string; quantity: number; set_img_url: string }[]
}

export async function inspectRebrickableSet(setNum: string): Promise<SetDetailResult | null> {
  const normalised = setNum.includes('-') ? setNum : `${setNum}-1`
  try {
    const [set, figRes] = await Promise.all([
      get<RebrickableSet>(`/sets/${normalised}/`),
      get<RebrickableListResponse<RebrickableMinifig>>(`/sets/${normalised}/minifigs/`, { page_size: '100' }),
    ])
    return { set, minifigs: figRes.results }
  } catch (err) {
    log.error('[Rebrickable] inspectRebrickableSet failed:', err)
    return null
  }
}

export async function importRebrickableSet(setNum: string): Promise<LegoSet | null> {
  try {
    const s = await get<RebrickableSet>(`/sets/${setNum}/`)
    return upsertSet({
      set_number: s.set_num,
      name: s.name,
      year: s.year,
      theme: null,
      piece_count: s.num_parts,
      retail_price_usd: null,
      image_url: s.set_img_url,
      rebrickable_url: s.set_url,
      bricklink_url: `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${s.set_num}`,
      notes: null,
      is_owned: 0,
      is_wanted: 0,
      condition: 'sealed',
      acquired_date: null,
      acquired_price: null,
    })
  } catch (err) {
    log.error('[Rebrickable] import failed:', err)
    return null
  }
}

/**
 * Fetch external IDs for a minifig from Rebrickable.
 * Returns the BrickLink ID(s) if available, e.g. ["sw0093"].
 */
export async function getMinifigExternalIds(figNum: string): Promise<{ bricklink: string[] }> {
  try {
    const data = await get<{
      external_ids?: { BrickLink?: string[] }
    }>(`/minifigs/${encodeURIComponent(figNum)}/`)
    return { bricklink: data.external_ids?.BrickLink ?? [] }
  } catch (err) {
    log.warn('[Rebrickable] getMinifigExternalIds failed:', err)
    return { bricklink: [] }
  }
}

/**
 * Search Rebrickable minifig catalog by name/character.
 * Returns results where set_num IS the BrickLink ID for non-fig- entries.
 */
export async function searchRebrickableMinifigs(query: string): Promise<RebrickableMinifigCatalog[]> {
  try {
    const res = await get<RebrickableListResponse<RebrickableMinifigCatalog>>('/minifigs/', {
      search: query,
      page_size: '20',
    })
    return res.results
  } catch (err) {
    log.error('[Rebrickable] searchRebrickableMinifigs failed:', err)
    return []
  }
}
