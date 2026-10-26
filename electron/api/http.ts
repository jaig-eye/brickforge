/**
 * The one HTTP helper every API client uses: timeouts on every call, retries
 * with backoff for 429/5xx, typed failures (AppError) instead of raw strings,
 * and per-service base URL overrides so tests can point the whole app at a
 * local fake server (BRICKFORGE_<SERVICE>_URL).
 */
import { AppError, SERVICE_LABEL, type ServiceName } from '../../src/lib/errors'

export interface RequestOpts {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string | FormData
  timeoutMs?: number
  /** Retries for 429/5xx and network errors. Default 0. */
  retries?: number
  /** Cap on a retry wait, however long the server's Retry-After says. */
  maxBackoffMs?: number
  /** Reject bodies larger than this many bytes. */
  maxBytes?: number
}

export interface HttpResponse {
  status: number
  headers: Headers
  body: Buffer
  text(): string
  json<T>(): T
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Base URL for a service, overridable for tests and self-hosted mirrors. */
export function serviceUrl(service: ServiceName, fallback: string): string {
  const key = `BRICKFORGE_${service.toUpperCase().replace(/-/g, '_')}_URL`
  return (process.env[key] || fallback).replace(/\/+$/, '')
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'the request timed out'
    if (cause?.code === 'ENOTFOUND' || cause?.code === 'EAI_AGAIN') return 'no internet connection'
    if (cause?.code === 'ECONNREFUSED') return 'the connection was refused'
    return cause?.message ?? err.message
  }
  return String(err)
}

/**
 * Perform a request. Resolves for every HTTP status (callers decide what a 404
 * means); rejects with an AppError only for network failures, timeouts, and
 * oversized bodies, after retries are spent.
 */
export async function request(service: ServiceName, url: string, opts: RequestOpts = {}): Promise<HttpResponse> {
  const { method = 'GET', headers = {}, body, timeoutMs = 20_000, retries = 0, maxBackoffMs = 8_000, maxBytes } = opts
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: { 'User-Agent': 'BrickForge/1.0 (+https://github.com/jaig-eye/brickforge)', ...headers },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      if (attempt < retries) { await sleep(Math.min(1000 * 2 ** attempt, maxBackoffMs)); continue }
      throw new AppError({ code: 'network', service, message: `Couldn't reach ${label(service)}: ${describe(err)}.` })
    }

    const retryable = res.status === 429 || res.status >= 500
    if (retryable && attempt < retries) {
      const ra = Number(res.headers.get('retry-after'))
      await res.arrayBuffer().catch(() => undefined)
      await sleep(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt, maxBackoffMs))
      continue
    }

    const declared = Number(res.headers.get('content-length'))
    if (maxBytes && Number.isFinite(declared) && declared > maxBytes) {
      await res.body?.cancel().catch(() => undefined)
      throw new AppError({ code: 'service', service, message: `The response from ${label(service)} was too large.` })
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (maxBytes && buf.length > maxBytes) {
      throw new AppError({ code: 'service', service, message: `The response from ${label(service)} was too large.` })
    }
    return {
      status: res.status,
      headers: res.headers,
      body: buf,
      text: () => buf.toString('utf8'),
      json: <T>() => {
        try { return JSON.parse(buf.toString('utf8')) as T }
        catch { throw new AppError({ code: 'service', service, message: `${label(service)} sent a response BrickForge couldn't read.` }) }
      },
    }
  }
}

/** Map a non-2xx status to the AppError the UI understands. */
export function statusError(service: ServiceName, status: number, detail = ''): AppError {
  const tail = detail ? ` (${detail.slice(0, 160)})` : ''
  if (status === 401 || status === 403) {
    return new AppError({ code: 'auth', service, message: `${label(service)} rejected the key. Check it in Settings.${tail}` })
  }
  if (status === 404) return new AppError({ code: 'not_found', service, message: `${label(service)} has no record of that.` })
  if (status === 429) return new AppError({ code: 'rate_limited', service, message: `${label(service)} is rate-limiting requests. Try again in a minute.` })
  return new AppError({ code: 'service', service, message: `${label(service)} returned an error ${status}.${tail}` })
}

const label = (s: ServiceName) => SERVICE_LABEL[s]
