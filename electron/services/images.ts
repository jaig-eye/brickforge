/**
 * Image handling for identification: format sniffing, downscaling before
 * upload, crops for group photos, and candidate thumbnails for visual judging.
 */
import { nativeImage } from 'electron'
import log from '../main/logger'
import { request } from '../api/http'

// 1536px keeps small printed set numbers legible while cutting a 12MP photo
// to a fraction of its upload size.
const MAX_EDGE = 1536

/** The real format from magic bytes — never trust extensions. */
export function sniffImageMime(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 4 && buf.toString('ascii', 0, 4).startsWith('GIF8')) return 'image/gif'
  return 'image/jpeg'
}

export interface PreparedImage {
  b64: string
  mediaType: string
  buffer: Buffer
}

/**
 * Downscale + re-encode a photo before it goes to any service. Formats
 * nativeImage can't decode (WebP) pass through with their TRUE mime type.
 */
export function prepImage(input: Buffer): PreparedImage {
  const realMime = sniffImageMime(input)
  try {
    const img = nativeImage.createFromBuffer(input)
    if (img.isEmpty()) return { b64: input.toString('base64'), mediaType: realMime, buffer: input }
    const { width, height } = img.getSize()
    if (Math.max(width, height) <= MAX_EDGE) return { b64: input.toString('base64'), mediaType: realMime, buffer: input }
    const out = width >= height ? img.resize({ width: MAX_EDGE, quality: 'best' }) : img.resize({ height: MAX_EDGE, quality: 'best' })
    const jpeg = out.toJPEG(86)
    return { b64: jpeg.toString('base64'), mediaType: 'image/jpeg', buffer: jpeg }
  } catch (err) {
    log.warn('[images] prep failed — sending original:', err)
    return { b64: input.toString('base64'), mediaType: realMime, buffer: input }
  }
}

export interface Box { x: number; y: number; w: number; h: number }

/** Crop a normalized (0–1) box, padded generously; null when too small. */
export function cropBox(img: Electron.NativeImage, box: Box): Buffer | null {
  try {
    const { width, height } = img.getSize()
    const pad = 0.18 // vision bounding boxes are imprecise
    const x = Math.max(0, Math.floor((box.x - box.w * pad) * width))
    const y = Math.max(0, Math.floor((box.y - box.h * pad) * height))
    const w = Math.min(width - x, Math.ceil(box.w * (1 + 2 * pad) * width))
    const h = Math.min(height - y, Math.ceil(box.h * (1 + 2 * pad) * height))
    if (w < 32 || h < 32) return null
    return img.crop({ x, y, width: w, height: h }).toJPEG(90)
  } catch {
    return null
  }
}

/** A small thumbnail of an image file, as a data URL (scan queue previews). */
export function thumbnailDataUrl(buf: Buffer, edge = 320): string | null {
  try {
    const img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) return `data:${sniffImageMime(buf)};base64,${buf.toString('base64')}`
    const { width, height } = img.getSize()
    const out = Math.max(width, height) > edge ? (width >= height ? img.resize({ width: edge }) : img.resize({ height: edge })) : img
    return `data:image/jpeg;base64,${out.toJPEG(80).toString('base64')}`
  } catch {
    return null
  }
}

/** Download an image (catalog CDN) as raw bytes. Null on any failure. */
export async function fetchImage(url: string | null | undefined): Promise<{ buffer: Buffer; mediaType: string } | null> {
  if (!url) return null
  try {
    const res = await request('rebrickable', url.startsWith('//') ? `https:${url}` : url, { timeoutMs: 12_000, maxBytes: 6_000_000 })
    if (res.status !== 200 || res.body.length < 64) return null
    return { buffer: res.body, mediaType: sniffImageMime(res.body) }
  } catch {
    return null
  }
}

/** A candidate's official image, small, for visual comparison. Fail-soft. */
export async function fetchThumb(url: string | null | undefined): Promise<{ b64: string; mediaType: string } | null> {
  if (!url) return null
  try {
    const res = await request('brickognize', url.startsWith('//') ? `https:${url}` : url, { timeoutMs: 10_000, maxBytes: 5_000_000 })
    if (res.status !== 200) return null
    const img = nativeImage.createFromBuffer(res.body)
    if (img.isEmpty()) {
      // WebP thumbs (Brickognize) can't be decoded here; providers accept them as-is
      return res.body.length <= 400_000 ? { b64: res.body.toString('base64'), mediaType: sniffImageMime(res.body) } : null
    }
    const { width, height } = img.getSize()
    const out = Math.max(width, height) > 384 ? (width >= height ? img.resize({ width: 384 }) : img.resize({ height: 384 })) : img
    return { b64: out.toJPEG(80).toString('base64'), mediaType: 'image/jpeg' }
  } catch (err) {
    // A judge without candidate images judges names, the failure visual judging exists to fix
    log.warn('[images] thumbnail fetch failed for', url, '—', err instanceof Error ? err.message : err)
    return null
  }
}
