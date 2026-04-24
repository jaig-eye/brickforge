/**
 * BrickLink API client — OAuth 1.0a price data.
 * Docs: https://www.bricklink.com/v3/api.page
 */
import https from 'https'
import crypto from 'crypto'
import log from '../main/logger'

interface BLCredentials {
  consumerKey: string
  consumerSecret: string
  token: string
  tokenSecret: string
}

interface PriceGuide {
  avg_price: string | number
  min_price: string | number
  max_price: string | number
  qty_avg_price: string | number
  total_quantity: number
  unit_quantity: number
}

export function hasBricklinkCredentials(): boolean {
  return getCredentials() !== null
}

function getCredentials(): BLCredentials | null {
  try {
    const fs = require('fs')
    const path = require('path')
    const { app } = require('electron')
    const s = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'))
    if (!s.bricklinkConsumerKey) return null
    return {
      consumerKey: s.bricklinkConsumerKey,
      consumerSecret: s.bricklinkConsumerSecret,
      token: s.bricklinkToken,
      tokenSecret: s.bricklinkTokenSecret,
    }
  } catch {
    return null
  }
}

function buildOAuthHeader(method: string, url: string, creds: BLCredentials): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const params: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.token,
    oauth_version: '1.0',
  }

  const sortedParams = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
  const paramStr = sortedParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const base = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramStr)}`
  const sigKey = `${encodeURIComponent(creds.consumerSecret)}&${encodeURIComponent(creds.tokenSecret)}`
  const sig = crypto.createHmac('sha1', sigKey).update(base).digest('base64')

  params['oauth_signature'] = sig
  const header = Object.entries(params).map(([k, v]) => `${k}="${encodeURIComponent(v)}"`).join(', ')
  return `OAuth ${header}`
}

function blGet<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const creds = getCredentials()
    if (!creds) return reject(new Error('BrickLink credentials not configured'))
    const url = `https://api.bricklink.com/api/store/v1${path}`
    const auth = buildOAuthHeader('GET', url, creds)
    https.get(url, { headers: { Authorization: auth, Accept: 'application/json' } }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`BrickLink ${res.statusCode}: ${data}`))
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error('Invalid BrickLink JSON')) }
      })
    }).on('error', reject)
  })
}

/** Map app condition strings to BrickLink N/U values. */
function toBLCondition(condition: string): 'N' | 'U' {
  return (condition === 'new' || condition === 'sealed') ? 'N' : 'U'
}

/** BrickLink REST API requires full type names in the URL path, not single-letter codes. */
const BL_TYPE: Record<'S' | 'M', string> = { S: 'SET', M: 'MINIFIG' }

export interface PriceResult {
  avg_price: number
  min_price: number | null
  max_price: number | null
  sample_count: number | null
  /** Whether the price came from recently-sold listings or current stock. */
  source: 'sold' | 'stock'
}

/**
 * Fetch BrickLink price for a set (itemType='S') or minifig (itemType='M').
 * Strategy: try guide_type=sold first; if no recent sales (total_quantity=0),
 * fall back to guide_type=stock and return the lowest current listing price.
 */
export async function fetchBricklinkPrice(
  itemNum: string,
  condition: string,
  itemType: 'S' | 'M' = 'S',
): Promise<PriceResult | null> {
  try {
    const newUsed = toBLCondition(condition)
    const blType = BL_TYPE[itemType]
    const base = `/items/${blType}/${itemNum}/price?new_or_used=${newUsed}&currency_code=USD&region=north_america`

    // 1. Try recently sold
    const soldRes = await blGet<{ data: PriceGuide }>(`${base}&guide_type=sold`)
    if (soldRes.data && soldRes.data.total_quantity > 0) {
      const d = soldRes.data
      return {
        avg_price:    parseFloat(d.avg_price as string),
        min_price:    parseFloat(d.min_price as string),
        max_price:    parseFloat(d.max_price as string),
        sample_count: d.total_quantity,
        source:       'sold',
      }
    }

    // 2. Fall back to current stock listings — use min_price as the reference value
    const stockRes = await blGet<{ data: PriceGuide }>(`${base}&guide_type=stock`)
    if (stockRes.data && stockRes.data.unit_quantity > 0) {
      const d = stockRes.data
      const minP = parseFloat(d.min_price as string)
      return {
        avg_price:    minP,           // lowest current listing as the reference
        min_price:    minP,
        max_price:    parseFloat(d.max_price as string),
        sample_count: d.unit_quantity,
        source:       'stock',
      }
    }

    return null
  } catch (err) {
    log.warn('[BrickLink] fetchPrice failed:', err)
    return null
  }
}
