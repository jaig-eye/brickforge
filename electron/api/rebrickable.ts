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

interface RebrickableListResponse<T> {
  count: number
  results: T[]
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
      condition: 'new',
      acquired_date: null,
      acquired_price: null,
    })
  } catch (err) {
    log.error('[Rebrickable] import failed:', err)
    return null
  }
}
