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
  avg_price: number
  min_price: number
  max_price: number
  qty_avg_price: number
  total_quantity: number
  unit_quantity: number
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

export interface PriceResult {
  avg_price: number
  min_price: number | null
  max_price: number | null
  sample_count: number | null
}

export async function fetchBricklinkPrice(setNum: string, condition: string): Promise<PriceResult | null> {
  try {
    const type = 'S' // set
    const newUsed = condition === 'new' ? 'N' : 'U'
    const res = await blGet<{ data: PriceGuide }>(`/items/${type}/${setNum}/price?guide_type=sold&new_or_used=${newUsed}&currency_code=USD`)
    const d = res.data
    return {
      avg_price: parseFloat(d.avg_price as unknown as string),
      min_price: parseFloat(d.min_price as unknown as string),
      max_price: parseFloat(d.max_price as unknown as string),
      sample_count: d.total_quantity,
    }
  } catch (err) {
    log.warn('[BrickLink] fetchPrice failed:', err)
    return null
  }
}
