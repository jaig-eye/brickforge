/**
 * BrickLink API client — OAuth 1.0a, used for market prices and catalog lookups.
 * Docs: https://www.bricklink.com/v3/api.page
 *
 * BrickLink has no catalog SEARCH endpoint; name search goes through
 * Rebrickable. What's real: /items/{type}/{no} and /items/{type}/{no}/price.
 */
import crypto from 'crypto'
import { readSettings } from '../main/settings-store'
import { AppError, missingKey } from '../../src/lib/errors'
import { request, serviceUrl, statusError } from './http'

export interface BricklinkCredentials {
  consumerKey: string
  consumerSecret: string
  token: string
  tokenSecret: string
}

const base = () => serviceUrl('bricklink', 'https://api.bricklink.com/api/store/v1')

function storedCredentials(): BricklinkCredentials | null {
  const s = readSettings()
  const creds = {
    consumerKey: s.bricklinkConsumerKey ?? '',
    consumerSecret: s.bricklinkConsumerSecret ?? '',
    token: s.bricklinkToken ?? '',
    tokenSecret: s.bricklinkTokenSecret ?? '',
  }
  // All four are needed to sign a request; a partial set would only 401 later
  return Object.values(creds).every(Boolean) ? creds : null
}

export function hasBricklinkCredentials(): boolean {
  return storedCredentials() !== null
}

/** OAuth 1.0a HMAC-SHA1 header. Query params are part of the signature base. */
export function oauthHeader(method: string, fullUrl: string, creds: BricklinkCredentials, nonce = crypto.randomBytes(16).toString('hex'), timestamp = Math.floor(Date.now() / 1000).toString()): string {
  const url = new URL(fullUrl)
  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.token,
    oauth_version: '1.0',
  }
  const all: [string, string][] = [...Object.entries(oauth)]
  url.searchParams.forEach((v, k) => all.push([k, v]))
  const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  const paramStr = all
    .map(([k, v]) => [enc(k), enc(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const signatureBase = `${method}&${enc(baseUrl)}&${enc(paramStr)}`
  const signingKey = `${enc(creds.consumerSecret)}&${enc(creds.tokenSecret)}`
  oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64')
  return 'OAuth ' + Object.entries(oauth).map(([k, v]) => `${k}="${enc(v)}"`).join(', ')
}

interface Envelope<T> {
  meta: { code: number; message: string; description?: string }
  data: T
}

async function blGet<T>(path: string, creds = storedCredentials()): Promise<T | null> {
  if (!creds) throw missingKey('bricklink', 'your four BrickLink API keys')
  const url = `${base()}${path}`
  const res = await request('bricklink', url, {
    headers: { Authorization: oauthHeader('GET', url, creds), Accept: 'application/json' },
    timeoutMs: 15_000,
    retries: 2,
  })
  if (res.status !== 200) throw statusError('bricklink', res.status, res.text())
  // BrickLink reports API-level failures inside a 200 envelope
  const env = res.json<Envelope<T>>()
  if (env.meta?.code === 404) return null
  if (env.meta?.code === 401 || env.meta?.code === 403) {
    throw new AppError({ code: 'auth', service: 'bricklink', message: `BrickLink rejected the keys (${env.meta.description || env.meta.message}). Check them in Settings, including the allowed IP.` })
  }
  if (env.meta && env.meta.code !== 200) {
    throw new AppError({ code: 'service', service: 'bricklink', message: `BrickLink error ${env.meta.code}: ${env.meta.description || env.meta.message}` })
  }
  return env.data
}

export type BricklinkType = 'SET' | 'MINIFIG' | 'PART'

export interface BricklinkItem {
  no: string
  name: string
  type: string
  image_url?: string
  thumbnail_url?: string
  year_released?: number | null
}

/** Validate keys without saving them (Settings → Test connection). */
export async function testBricklinkCredentials(creds: BricklinkCredentials): Promise<void> {
  await blGet('/items/SET/75192-1', creds)
}

/** One catalog record by BrickLink number. Null when BrickLink doesn't know it. */
export async function getBricklinkItem(type: BricklinkType, no: string): Promise<BricklinkItem | null> {
  const item = await blGet<BricklinkItem>(`/items/${type}/${encodeURIComponent(type === 'SET' ? normSetNum(no) : no)}`)
  if (!item?.no) return null
  // BrickLink hands out protocol-relative image URLs
  const fix = (u?: string) => (u && u.startsWith('//') ? `https:${u}` : u)
  return { ...item, name: decodeEntities(item.name ?? ''), image_url: fix(item.image_url), thumbnail_url: fix(item.thumbnail_url) }
}

export interface BricklinkSetFig { no: string; name: string; quantity: number }

interface SubsetGroup { entries: { item: { no: string; name: string; type: string }; quantity: number; is_alternate?: boolean }[] }

const setFigsCache = new Map<string, BricklinkSetFig[] | null>()

/**
 * The minifigures in a set, by BrickLink id, from the set's BrickLink
 * inventory. BrickLink has no catalog search, so this is how a set's figures
 * get their BrickLink ids. Null when BrickLink doesn't know the set.
 */
export async function getBricklinkSetMinifigs(setNumber: string): Promise<BricklinkSetFig[] | null> {
  const no = normSetNum(setNumber)
  if (setFigsCache.has(no)) return setFigsCache.get(no)!
  const groups = await blGet<SubsetGroup[]>(`/items/SET/${encodeURIComponent(no)}/subsets?break_minifigs=false`)
  let figs: BricklinkSetFig[] | null = null
  if (groups) {
    const byNo = new Map<string, BricklinkSetFig>()
    for (const e of groups.flatMap((g) => g.entries ?? [])) {
      if (e.item?.type !== 'MINIFIG' || e.is_alternate) continue
      const seen = byNo.get(e.item.no)
      if (seen) seen.quantity += e.quantity || 1
      else byNo.set(e.item.no, { no: e.item.no, name: decodeEntities(e.item.name ?? ''), quantity: e.quantity || 1 })
    }
    figs = [...byNo.values()]
  }
  setFigsCache.set(no, figs)
  return figs
}

/**
 * BrickLink's API sends names HTML-escaped ("BB-8 &#40;Large Photoreceptor…&#41;");
 * they're stored and shown as plain text. &amp; goes last so "&amp;#40;" stays literal.
 */
function decodeEntities(s: string): string {
  const cp = (n: number, raw: string) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw)
  const named: Record<string, string> = { quot: '"', apos: "'", lt: '<', gt: '>' }
  return s
    .replace(/&#(\d+);/g, (raw, d: string) => cp(Number(d), raw))
    .replace(/&#x([0-9a-f]+);/gi, (raw, h: string) => cp(parseInt(h, 16), raw))
    .replace(/&(quot|apos|lt|gt);/g, (_, n: string) => named[n])
    .replace(/&amp;/g, '&')
}

export interface PriceResult {
  avg_price: number
  min_price: number | null
  max_price: number | null
  sample_count: number | null
  /** Recently sold listings, or (when nothing sold) the cheapest current listing. */
  source: 'sold' | 'stock'
}

interface PriceGuide {
  avg_price: string
  min_price: string
  max_price: string
  qty_avg_price: string
  total_quantity: number
  unit_quantity: number
}

const normSetNum = (n: string) => (n.includes('-') ? n : `${n}-1`)

/**
 * Market price for a set or minifig in one condition (US region, USD).
 * Sold prices from the last six months first; if nothing sold, the cheapest
 * current listing stands in. Null when BrickLink has neither.
 */
export async function fetchBricklinkPrice(itemNo: string, condition: 'new' | 'used', type: 'SET' | 'MINIFIG'): Promise<PriceResult | null> {
  const no = type === 'SET' ? normSetNum(itemNo) : itemNo
  const qs = `new_or_used=${condition === 'new' ? 'N' : 'U'}&currency_code=USD&region=north_america`
  const path = `/items/${type}/${encodeURIComponent(no)}/price?${qs}`

  const sold = await blGet<PriceGuide>(`${path}&guide_type=sold`)
  if (sold && sold.total_quantity > 0) {
    return {
      avg_price: num(sold.avg_price),
      min_price: num(sold.min_price),
      max_price: num(sold.max_price),
      sample_count: sold.total_quantity,
      source: 'sold',
    }
  }
  const stock = await blGet<PriceGuide>(`${path}&guide_type=stock`)
  if (stock && stock.unit_quantity > 0) {
    const min = num(stock.min_price)
    return { avg_price: min, min_price: min, max_price: num(stock.max_price), sample_count: stock.unit_quantity, source: 'stock' }
  }
  return null
}

const num = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** Public catalog image (no key needed): BrickLink's image CDN. */
export function bricklinkImageUrl(type: 'S' | 'M' | 'P', no: string): string {
  if (type === 'S') return `https://img.bricklink.com/ItemImage/SN/0/${encodeURIComponent(normSetNum(no))}.png`
  if (type === 'M') return `https://img.bricklink.com/ItemImage/MN/0/${encodeURIComponent(no)}.png`
  return `https://img.bricklink.com/ItemImage/PN/0/${encodeURIComponent(no)}.png`
}
