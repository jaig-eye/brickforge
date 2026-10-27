/**
 * One local HTTP server that stands in for every external service BrickForge
 * talks to: Rebrickable, BrickLink, Brickognize, OpenAI, and Anthropic.
 * Responses come from recorded fixtures (tests/fixtures/<service>/), and the
 * AI stand-ins answer deterministically from the prompt, so the whole
 * identification pipeline runs end to end without keys or network.
 *
 * Also used by the Electron end-to-end tests (see tests/e2e/fake-api-server.ts).
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import type { AddressInfo } from 'net'

export interface FakeRequest {
  service: string
  method: string
  path: string
  query: URLSearchParams
  headers: http.IncomingHttpHeaders
  body: Buffer
}

/** body sends raw bytes (an image), json or text otherwise */
export type Override = (req: FakeRequest) => { status?: number; json?: unknown; text?: string; body?: Buffer; headers?: Record<string, string> } | undefined

export interface FakeApis {
  urls: Record<'rebrickable' | 'bricklink' | 'brickognize' | 'openai' | 'anthropic', string>
  requests: FakeRequest[]
  /** Answer matching requests yourself (first match wins); returns an undo function. */
  override(fn: Override): () => void
  close(): Promise<void>
}

const FIXTURES = path.resolve(__dirname, '../fixtures')
const VALID_KEYS = {
  rebrickable: 'test-rebrickable-key',
  openai: 'test-openai-key',
  anthropic: 'test-anthropic-key',
  bricklinkConsumer: 'test-consumer-key',
}
export { VALID_KEYS }

function fixture<T = unknown>(service: string, name: string): T | null {
  const p = path.join(FIXTURES, service, `${name}.json`)
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as T) : null
}

type Reply = { status: number; json?: unknown; text?: string; body?: Buffer; headers?: Record<string, string> }

// ── Rebrickable ───────────────────────────────────────────────────────────────

function rebrickable(req: FakeRequest): Reply {
  if (req.headers.authorization !== `key ${VALID_KEYS.rebrickable}`) return { status: 401, json: { detail: 'Invalid token.' } }
  const sets = fixture<Record<string, unknown>>('rebrickable', 'sets') ?? {}
  const figs = fixture<Record<string, { external_ids?: unknown; sets?: unknown[] } & Record<string, unknown>>>('rebrickable', 'minifigs') ?? {}
  const setFigs = fixture<Record<string, unknown[]>>('rebrickable', 'set-minifigs') ?? {}
  const p = req.path
  let m: RegExpMatchArray | null
  if (p === '/themes/') return { status: 200, json: fixture('rebrickable', 'themes') ?? { count: 0, results: [] } }
  if ((m = p.match(/^\/sets\/([^/]+)\/minifigs\/$/))) {
    const list = setFigs[decodeURIComponent(m[1])] ?? []
    return { status: 200, json: { count: list.length, results: list } }
  }
  if ((m = p.match(/^\/sets\/([^/]+)\/$/))) {
    const s = sets[decodeURIComponent(m[1])]
    return s ? { status: 200, json: s } : { status: 404, json: { detail: 'Not found.' } }
  }
  if (p === '/sets/') {
    const q = (req.query.get('search') ?? '').toLowerCase()
    const minParts = Number(req.query.get('min_parts') ?? 0)
    const theme = req.query.get('theme_id')
    let list = Object.values(sets) as { name: string; set_num: string; num_parts: number; theme_id: number; year: number }[]
    if (q) list = list.filter((s) => q.split(/\s+/).every((w) => `${s.name} ${s.set_num}`.toLowerCase().includes(w)))
    if (minParts) list = list.filter((s) => s.num_parts >= minParts)
    if (theme) list = list.filter((s) => String(s.theme_id) === theme)
    const order = req.query.get('ordering')
    if (order === '-year') list = [...list].sort((a, b) => b.year - a.year)
    const size = Number(req.query.get('page_size') ?? 20)
    const page = Number(req.query.get('page') ?? 1)
    return { status: 200, json: { count: list.length, results: list.slice((page - 1) * size, page * size) } }
  }
  if ((m = p.match(/^\/minifigs\/([^/]+)\/sets\/$/))) {
    const f = figs[decodeURIComponent(m[1])]
    const list = (f?.sets ?? []) as unknown[]
    return { status: 200, json: { count: list.length, results: list } }
  }
  if ((m = p.match(/^\/minifigs\/([^/]+)\/$/))) {
    const f = figs[decodeURIComponent(m[1])]
    if (!f) return { status: 404, json: { detail: 'Not found.' } }
    const { sets: _sets, ...rest } = f
    return { status: 200, json: rest }
  }
  if (p === '/minifigs/') {
    const q = (req.query.get('search') ?? '').toLowerCase()
    let list = Object.values(figs).map(({ sets: _s, external_ids: _e, ...rest }) => rest) as { name: string; set_num: string }[]
    if (q) list = list.filter((f) => q.split(/\s+/).every((w) => `${f.name} ${f.set_num}`.toLowerCase().includes(w)))
    const size = Number(req.query.get('page_size') ?? 20)
    return { status: 200, json: { count: list.length, results: list.slice(0, size) } }
  }
  return { status: 404, json: { detail: 'Not found.' } }
}

// ── BrickLink ─────────────────────────────────────────────────────────────────

function bricklink(req: FakeRequest): Reply {
  const auth = String(req.headers.authorization ?? '')
  const ok = auth.startsWith('OAuth ') && auth.includes(`oauth_consumer_key="${VALID_KEYS.bricklinkConsumer}"`) && auth.includes('oauth_signature=')
  if (!ok) return { status: 200, json: { meta: { code: 401, message: 'BAD_OAUTH_REQUEST', description: 'Invalid consumer key' }, data: {} } }
  const items = fixture<Record<string, unknown>>('bricklink', 'items') ?? {}
  const prices = fixture<Record<string, unknown>>('bricklink', 'prices') ?? {}
  let m: RegExpMatchArray | null
  if ((m = req.path.match(/^\/items\/(SET|MINIFIG|PART)\/([^/]+)\/price$/))) {
    const key = `${m[1]}/${decodeURIComponent(m[2])}/${req.query.get('new_or_used')}/${req.query.get('guide_type')}`
    const data = prices[key]
    return data
      ? { status: 200, json: { meta: { code: 200, message: 'OK' }, data } }
      : { status: 200, json: { meta: { code: 200, message: 'OK' }, data: { avg_price: '0.0000', min_price: '0.0000', max_price: '0.0000', qty_avg_price: '0.0000', total_quantity: 0, unit_quantity: 0, price_detail: [] } } }
  }
  // A set's inventory (minifig entries only, recorded from the real API)
  if ((m = req.path.match(/^\/items\/SET\/([^/]+)\/subsets$/))) {
    const data = (fixture<Record<string, unknown>>('bricklink', 'subsets') ?? {})[`SET/${decodeURIComponent(m[1])}`]
    return data
      ? { status: 200, json: { meta: { code: 200, message: 'OK' }, data } }
      : { status: 200, json: { meta: { code: 404, message: 'RESOURCE_NOT_FOUND', description: 'Item not found' }, data: {} } }
  }
  if ((m = req.path.match(/^\/items\/(SET|MINIFIG|PART)\/([^/]+)$/))) {
    const data = items[`${m[1]}/${decodeURIComponent(m[2])}`]
    return data
      ? { status: 200, json: { meta: { code: 200, message: 'OK' }, data } }
      : { status: 200, json: { meta: { code: 404, message: 'RESOURCE_NOT_FOUND', description: 'Item not found' }, data: {} } }
  }
  return { status: 404, text: 'Not found' }
}

// ── Brickognize ───────────────────────────────────────────────────────────────

function brickognize(req: FakeRequest): Reply {
  if (req.path === '/health/') return { status: 200, json: { success: true } }
  const m = req.path.match(/^\/predict\/(figs|sets|parts)\/$/)
  if (!m || req.method !== 'POST') return { status: 404, json: { detail: 'Not Found' } }
  if (!String(req.headers['content-type'] ?? '').startsWith('multipart/form-data')) return { status: 422, json: { detail: 'query_image required' } }
  return { status: 200, json: fixture('brickognize', m[1]) ?? { listing_id: 'x', items: [] } }
}

// ── AI stand-ins: deterministic answers derived from the prompt ──────────────

function promptText(body: unknown): string {
  const parts: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') return
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.type === 'text' && typeof o.text === 'string') parts.push(o.text)
      Object.values(o).forEach(walk)
    }
  }
  walk(body)
  return parts.join('\n')
}

/** What a sensible model would answer, given the prompt. */
export function fakeAiAnswer(prompt: string): string {
  if (prompt.includes('Decide the MAIN SUBJECT') || prompt.includes('decide the MAIN SUBJECT')) {
    return JSON.stringify({ subject: 'minifig', character: 'Clone Trooper', franchise: 'Star Wars', features: ['white armor'], search_terms: ['Clone Trooper'] })
  }
  const pick = prompt.match(/CANDIDATE 1: (\S+)/)
  if (pick) return JSON.stringify({ picks: [{ fig_number: pick[1], confidence: 0.9, reason: 'Torso and helmet prints match' }] })
  if (prompt.includes('FOUND BY NAME')) return JSON.stringify({ queries: ['Millennium Falcon'], franchise: 'Star Wars' })
  const cand = prompt.match(/• (\d+[\w-]*) — /)
  if (prompt.includes('set identifier')) {
    return JSON.stringify(cand
      ? { set_number: cand[1].replace(/-\d+$/, ''), set_name: 'Matched', confidence: 0.88, set_number_visible: false, visible_number: null, notes: 'Hull shape, color scheme, and the printed details match the official image of this set.' }
      : { set_number: null, set_name: null, confidence: 0.05, set_number_visible: false, visible_number: null, notes: 'No identifiable set' })
  }
  if (prompt.includes('bounding box')) return JSON.stringify({ boxes: [{ x: 0.05, y: 0.1, w: 0.4, h: 0.8 }, { x: 0.55, y: 0.1, w: 0.4, h: 0.8 }] })
  if (prompt.includes('LIST of LEGO items')) return JSON.stringify({ rows: [{ number: '75192', kind: 'set', quantity: 1, confidence: 0.97, raw: '75192' }, { number: 'sw0001a', kind: 'minifig', quantity: 2, confidence: 0.8, raw: 'sw0001a x2' }] })
  if (prompt.includes('Identify all LEGO pieces')) return JSON.stringify([{ name: 'Brick 2 x 4', part_number: '3001', color: 'Red', confidence: 0.8 }])
  if (prompt.includes('eBay listing')) {
    const name = prompt.match(/Name\s+:\s+(.+)/)?.[1]?.trim() ?? 'Set'
    const num = prompt.match(/Set Number : (\S+)/)?.[1] ?? ''
    return JSON.stringify({
      title: `LEGO ${name} ${num} | Complete w/ Manual & Minifigs Extra Long Title Words Here`,
      description: `<div style="background:#111"><h2 style="color:#fff">${name}</h2><script>alert(1)</script><p onclick="x()">Great set.</p><img src=x onerror=alert(1)></div>`,
    })
  }
  return '{}'
}

function openai(req: FakeRequest): Reply {
  if (req.headers.authorization !== `Bearer ${VALID_KEYS.openai}`) return { status: 401, json: { error: { message: 'Incorrect API key provided.' } } }
  if (req.path === '/v1/models') return { status: 200, json: { object: 'list', data: [{ id: 'gpt-4o-mini', object: 'model' }] } }
  if (req.path === '/v1/chat/completions') {
    const body = JSON.parse(req.body.toString() || '{}')
    return { status: 200, json: { id: 'chatcmpl-test', object: 'chat.completion', model: body.model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: fakeAiAnswer(promptText(body.messages)) } }] } }
  }
  return { status: 404, json: { error: { message: 'Not found' } } }
}

function anthropic(req: FakeRequest): Reply {
  if (req.headers['x-api-key'] !== VALID_KEYS.anthropic) return { status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }
  if (req.path.startsWith('/v1/models')) return { status: 200, json: { data: [{ id: 'claude-opus-5-5', type: 'model', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' } }
  if (req.path === '/v1/messages') {
    const body = JSON.parse(req.body.toString() || '{}')
    return {
      status: 200,
      json: {
        id: 'msg_test', type: 'message', role: 'assistant', model: body.model,
        content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: fakeAiAnswer(promptText(body.messages)) }],
        stop_reason: 'end_turn', stop_sequence: null, stop_details: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    }
  }
  return { status: 404, json: { type: 'error', error: { type: 'not_found_error', message: 'Not found' } } }
}

const ROUTES: Record<string, (req: FakeRequest) => Reply> = { rebrickable, bricklink, brickognize, openai, anthropic }

export async function startFakeApis(port = 0): Promise<FakeApis> {
  const requests: FakeRequest[] = []
  const overrides: Override[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const [, service, ...rest] = url.pathname.split('/')
      const fr: FakeRequest = { service, method: req.method ?? 'GET', path: `/${rest.join('/')}`, query: url.searchParams, headers: req.headers, body: Buffer.concat(chunks) }
      requests.push(fr)
      let reply: Reply | undefined
      for (const o of overrides) {
        const r = o(fr)
        if (r) { reply = { status: r.status ?? 200, json: r.json, text: r.text, body: r.body, headers: r.headers }; break }
      }
      reply ??= ROUTES[service]?.(fr) ?? { status: 404, text: 'Unknown service' }
      const type = reply.body ? 'application/octet-stream' : reply.json !== undefined ? 'application/json' : 'text/plain'
      res.writeHead(reply.status, { 'content-type': type, ...reply.headers })
      res.end(reply.body ?? (reply.json !== undefined ? JSON.stringify(reply.json) : (reply.text ?? '')))
    })
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    urls: {
      rebrickable: `${base}/rebrickable`,
      bricklink: `${base}/bricklink`,
      brickognize: `${base}/brickognize`,
      openai: `${base}/openai`,
      anthropic: `${base}/anthropic`,
    },
    requests,
    override(fn) {
      overrides.unshift(fn)
      return () => { const i = overrides.indexOf(fn); if (i !== -1) overrides.splice(i, 1) }
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
