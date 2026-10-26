/**
 * BrickLink signs every request with OAuth 1.0a (HMAC-SHA1). The reference
 * signer below is written from RFC 5849 §3.4 directly — byte-wise RFC 3986
 * percent-encoding, form-decoded query parameters — so it shares no code
 * with the implementation it checks.
 */
import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { oauthHeader, type BricklinkCredentials } from '../../electron/api/bricklink'

/** RFC 3986 §2.3: everything but ALPHA / DIGIT / "-" / "." / "_" / "~" is %XX (uppercase). */
function pct(s: string): string {
  let out = ''
  for (const byte of Buffer.from(s, 'utf8')) {
    const c = String.fromCharCode(byte)
    out += /[A-Za-z0-9\-._~]/.test(c) ? c : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

/** application/x-www-form-urlencoded decoding of a query string ("+" is a space). */
function formDecode(query: string): [string, string][] {
  if (!query) return []
  return query.split('&').filter(Boolean).map((pair) => {
    const i = pair.indexOf('=')
    const [k, v] = i === -1 ? [pair, ''] : [pair.slice(0, i), pair.slice(i + 1)]
    const dec = (x: string) => decodeURIComponent(x.replace(/\+/g, ' '))
    return [dec(k), dec(v)]
  })
}

function referenceSignature(method: string, url: string, creds: BricklinkCredentials, nonce: string, timestamp: string): { base: string; signature: string } {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i.exec(url)!
  const scheme = m[1].toLowerCase()
  let authority = m[2].toLowerCase()
  if ((scheme === 'http' && authority.endsWith(':80')) || (scheme === 'https' && authority.endsWith(':443'))) authority = authority.replace(/:\d+$/, '')
  const baseUri = `${scheme}://${authority}${m[3] || '/'}`
  const params: [string, string][] = [
    ...formDecode(m[4] ?? ''),
    ['oauth_consumer_key', creds.consumerKey],
    ['oauth_token', creds.token],
    ['oauth_signature_method', 'HMAC-SHA1'],
    ['oauth_timestamp', timestamp],
    ['oauth_nonce', nonce],
    ['oauth_version', '1.0'],
  ]
  const normalized = params
    .map(([k, v]) => [pct(k), pct(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const base = [method.toUpperCase(), pct(baseUri), pct(normalized)].join('&')
  const key = `${pct(creds.consumerSecret)}&${pct(creds.tokenSecret)}`
  return { base, signature: crypto.createHmac('sha1', key).update(base).digest('base64') }
}

/** The header's parameters, percent-decoded. */
function parseHeader(header: string): Record<string, string> {
  expect(header.startsWith('OAuth ')).toBe(true)
  return Object.fromEntries([...header.slice(6).matchAll(/([a-z_]+)="([^"]*)"/g)].map((m) => [m[1], decodeURIComponent(m[2])]))
}

const creds: BricklinkCredentials = {
  consumerKey: 'test-consumer-key',
  consumerSecret: "s3cret!*'()&=+ ~é",
  token: 'tok en/42',
  tokenSecret: 'tok-secret_~.%',
}

describe('BrickLink OAuth 1.0a signing', () => {
  it('matches the OAuth 1.0 reference example (photos.example.net)', () => {
    const header = oauthHeader('GET', 'http://photos.example.net/photos?file=vacation.jpg&size=original', {
      consumerKey: 'dpf43f3p2l4k3l03', consumerSecret: 'kd94hf93k423kf44', token: 'nnch734d00sl2jdk', tokenSecret: 'pfkkdhi9sl3r4s00',
    }, 'kllo9940pd9333jh', '1191242096')
    expect(parseHeader(header).oauth_signature).toBe('tR3+Ty81lMeYAr/Fid0kMTYa/WM=')
  })

  it('is deterministic for a fixed nonce and timestamp', () => {
    const url = 'https://api.bricklink.com/api/store/v1/items/SET/75192-1'
    expect(oauthHeader('GET', url, creds, 'abc123', '1700000000')).toBe(oauthHeader('GET', url, creds, 'abc123', '1700000000'))
    expect(oauthHeader('GET', url, creds, 'abc124', '1700000000')).not.toBe(oauthHeader('GET', url, creds, 'abc123', '1700000000'))
  })

  it('signs a price-guide request, query parameters included, exactly as RFC 5849 specifies', () => {
    const url = 'https://api.bricklink.com/api/store/v1/items/SET/75192-1/price?new_or_used=N&currency_code=USD&region=north_america&guide_type=sold'
    const header = oauthHeader('GET', url, creds, 'n0nce', '1761400000')
    const expected = referenceSignature('GET', url, creds, 'n0nce', '1761400000')
    expect(parseHeader(header).oauth_signature).toBe(expected.signature)
    expect(expected.base).toContain('guide_type%3Dsold')
  })

  it('percent-encodes the characters encodeURIComponent leaves alone (!\'()*), spaces, and UTF-8', () => {
    const url = "https://api.bricklink.com/api/store/v1/items/MINIFIG/sw0700?q=it's%20(a)%20test*!&name=Kuiil+%C3%A9&dup=b&dup=a"
    const header = oauthHeader('GET', url, creds, "nonce!*'()", '1761400000')
    expect(parseHeader(header).oauth_signature).toBe(referenceSignature('GET', url, creds, "nonce!*'()", '1761400000').signature)
    // The header itself carries every value percent-encoded
    expect(header).toContain('oauth_nonce="nonce%21%2A%27%28%29"')
    expect(header).toContain('oauth_token="tok%20en%2F42"')
  })

  it('normalizes the scheme, host, and default port in the base string', () => {
    const url = 'HTTPS://API.BrickLink.com:443/api/store/v1/items/SET/10497-1'
    const header = oauthHeader('GET', url, creds, 'n', '1')
    expect(parseHeader(header).oauth_signature).toBe(referenceSignature('GET', url, creds, 'n', '1').signature)
  })

  it('changes the signature when the query changes (the query is signed)', () => {
    const a = parseHeader(oauthHeader('GET', 'https://api.bricklink.com/x?new_or_used=N', creds, 'n', '1')).oauth_signature
    const b = parseHeader(oauthHeader('GET', 'https://api.bricklink.com/x?new_or_used=U', creds, 'n', '1')).oauth_signature
    expect(a).not.toBe(b)
  })

  it('sends the protocol parameters BrickLink requires', () => {
    const p = parseHeader(oauthHeader('GET', 'https://api.bricklink.com/x', creds, 'n', '1761400000'))
    expect(p).toMatchObject({
      oauth_consumer_key: 'test-consumer-key', oauth_token: 'tok en/42', oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: '1761400000', oauth_nonce: 'n', oauth_version: '1.0',
    })
    expect(p.oauth_signature).toMatch(/^[A-Za-z0-9+/]{27}=$/)
  })
})
