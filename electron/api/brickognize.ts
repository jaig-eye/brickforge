/**
 * Brickognize API client — the LEGO community's free image recognizer
 * (sets, minifigs, parts). No key required. Docs: https://api.brickognize.com/docs
 *
 * Stage 0 of identification: a strong fig or part match skips the AI pipeline
 * entirely; set matches are only ever candidates (see identify.ts for why).
 */
import { request, serviceUrl, statusError } from './http'

export interface BrickognizeItem {
  id: string          // BrickLink-style id: figs "sw0380", sets "75192-1", parts "3001"
  name: string
  img_url: string | null
  type: 'part' | 'set' | 'fig' | 'sticker'
  category: string | null
  score: number       // 0–1 visual similarity
  external_sites: { name: string; url: string }[]
}

export type BrickognizeOutcome =
  | { ok: true; items: BrickognizeItem[] }
  | { ok: false; reason: string }        // the SERVICE failed — not "no match"

const base = () => serviceUrl('brickognize', 'https://api.brickognize.com')
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

async function predict(kind: 'figs' | 'sets' | 'parts', image: Buffer, mediaType: string): Promise<BrickognizeOutcome> {
  try {
    const form = new FormData()
    // Declare the TRUE content type — small PNG/WebP images pass through
    // un-transcoded, and mislabeling them can fail the request.
    form.append('query_image', new Blob([new Uint8Array(image)], { type: mediaType }), `scan.${EXT[mediaType] ?? 'jpg'}`)
    const res = await request('brickognize', `${base()}/predict/${kind}/`, {
      method: 'POST', body: form, headers: { Accept: 'application/json' }, timeoutMs: 20_000, retries: 1,
    })
    if (res.status !== 200) throw statusError('brickognize', res.status, res.text())
    const type = kind === 'figs' ? 'fig' : kind === 'sets' ? 'set' : 'part'
    const items = (res.json<{ items?: BrickognizeItem[] }>().items ?? []).filter((i) => i.type === type)
    return { ok: true, items }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

export const brickognizeFigs = (image: Buffer, mediaType: string) => predict('figs', image, mediaType)
export const brickognizeSets = (image: Buffer, mediaType: string) => predict('sets', image, mediaType)
export const brickognizeParts = (image: Buffer, mediaType: string) => predict('parts', image, mediaType)

/** Settings → Test connection: the public health endpoint. */
export async function testBrickognize(): Promise<void> {
  const res = await request('brickognize', `${base()}/health/`, { timeoutMs: 10_000 })
  if (res.status !== 200) throw statusError('brickognize', res.status)
}

/** The top item when it clears the trust threshold — shared fig/part policy. */
export function trustedTop(outcome: BrickognizeOutcome, threshold: number): BrickognizeItem | null {
  if (!outcome.ok || !outcome.items[0]) return null
  return outcome.items[0].score >= threshold ? outcome.items[0] : null
}
