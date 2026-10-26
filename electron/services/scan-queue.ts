/**
 * The persistent scan queue: photos are saved to userData/scans and
 * identified one at a time in the background. The queue survives restarts,
 * and the enqueue call returns immediately — even group-photo splitting
 * happens in the worker.
 */
import { app, nativeImage } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { IPC } from '../../src/lib/ipc-types'
import type { ScanType, FigIdentifyResult, SetIdentifyResult } from '../../src/lib/types'
import log from '../main/logger'
import {
  enqueueScanJob, listScanJobs, nextQueuedJob, updateScanJob, resetStuckJobs, getScanJob,
  deleteScanJobs, referencedScanImages, insertScanEval,
} from '../db/queries/scan.queries'
import { identifyMinifigPhoto, identifySetPhoto, detectFigBoxes, stripSetSuffix } from './identify'
import { prepImage, cropBox, thumbnailDataUrl } from './images'
import { push } from './notify'

const scansDir = () => path.join(app.getPath('userData'), 'scans')
const notify = () => push(IPC.PUSH_SCAN, listScanJobs())

function saveImage(buf: Buffer): { filePath: string; hash: string } {
  fs.mkdirSync(scansDir(), { recursive: true })
  const hash = crypto.createHash('sha1').update(buf).digest('hex')
  const filePath = path.join(scansDir(), `${hash}.jpg`)
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buf)
  return { filePath, hash }
}

function removeFiles(paths: string[]): void {
  const root = path.resolve(scansDir())
  for (const p of paths) {
    // Only ever delete inside the scans folder
    if (!path.resolve(p).startsWith(root + path.sep)) continue
    try { fs.unlinkSync(p) } catch { /* already gone */ }
  }
}

/** Queue photos (raw bytes as base64) for identification. Returns at once. */
export function enqueuePhotos(images: string[], scanType: ScanType, splitGroups: boolean): number {
  let n = 0
  for (const b64 of images) {
    if (typeof b64 !== 'string' || !b64) continue
    const raw = Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64')
    if (raw.length < 64 || raw.length > 40_000_000) continue
    const { filePath, hash } = saveImage(prepImage(raw).buffer)
    enqueueScanJob(scanType, filePath, hash, { split: splitGroups && scanType === 'minifig' })
    n++
  }
  notify()
  void runQueue()
  return n
}

let running = false

export async function runQueue(): Promise<void> {
  if (running) return
  running = true
  try {
    for (let job = nextQueuedJob(); job; job = nextQueuedJob()) {
      updateScanJob(job.id, { status: 'running' })
      notify()
      try {
        const photo = fs.readFileSync(job.image_path)

        if (job.split_pending) {
          const boxes = await detectFigBoxes(photo)
          if (boxes.length > 1) {
            const decoded = nativeImage.createFromBuffer(photo)
            let made = 0
            for (const box of boxes) {
              const crop = decoded.isEmpty() ? null : cropBox(decoded, box)
              if (!crop) continue
              const saved = saveImage(crop)
              enqueueScanJob('minifig', saved.filePath, saved.hash, { isCrop: true })
              made++
            }
            if (made > 1) {
              // The group photo itself is done; its figures are now their own jobs
              updateScanJob(job.id, { status: 'dismissed', split_pending: 0 })
              notify()
              continue
            }
          }
          updateScanJob(job.id, { split_pending: 0 })
        }

        if (job.scan_type === 'set') {
          const result = await identifySetPhoto(photo)
          if (result.error && !result.candidates.length) throw new Error(result.error)
          updateScanJob(job.id, { status: 'done', result_json: JSON.stringify(result), confidence: result.confidence, error: null })
        } else {
          const result = await identifyMinifigPhoto(photo)
          // A built set scanned in minifig mode: reroute (never for crops of a
          // group photo — those are minifigs by construction)
          if (result.subject === 'set' && !job.is_crop) {
            const setResult = await identifySetPhoto(photo)
            if (setResult.rb || setResult.candidates.length) {
              // ONE write: type, result, and confidence change together
              updateScanJob(job.id, { scan_type: 'set', status: 'done', result_json: JSON.stringify(setResult), confidence: setResult.confidence, error: null })
              notify()
              continue
            }
            result.error = 'This looks like a built set, but no set matched. Try a straight-on photo in Sets mode.'
          }
          // Explanatory non-matches finish as done: a retry would repeat the same answer
          if (result.error && !result.matches.length && !result.subject) throw new Error(result.error)
          updateScanJob(job.id, { status: 'done', result_json: JSON.stringify(result), confidence: result.matches[0]?.confidence ?? 0, error: null })
        }
      } catch (err) {
        updateScanJob(job.id, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
      notify()
    }
  } finally {
    running = false
  }
}

export function resumeQueue(): void {
  try {
    if (resetStuckJobs() > 0) log.info('[scan] requeued jobs interrupted by the last session')
    if (nextQueuedJob()) void runQueue()
  } catch (err) {
    log.warn('[scan] resume failed:', err)
  }
}

export function retryJob(id: number): void {
  updateScanJob(id, { status: 'queued', error: null })
  notify()
  void runQueue()
}

export function dismissJobs(ids: number[]): void {
  removeFiles(deleteScanJobs(ids))
  notify()
}

export function clearFinished(): number {
  const before = listScanJobs().length
  removeFiles(deleteScanJobs('finished'))
  notify()
  return before - listScanJobs().length
}

/** Delete scan photos no job references (left behind by older versions). */
export function cleanOrphanScanFiles(): void {
  try {
    const dir = scansDir()
    if (!fs.existsSync(dir)) return
    const used = new Set([...referencedScanImages()].map((p) => path.resolve(p)))
    const orphans = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).map((f) => path.join(dir, f)).filter((p) => !used.has(path.resolve(p)))
    removeFiles(orphans)
    if (orphans.length) log.info(`[scan] removed ${orphans.length} orphaned scan photo(s)`)
  } catch (err) {
    log.warn('[scan] orphan cleanup failed:', err)
  }
}

export function jobThumbnail(id: number): string | null {
  const job = getScanJob(id)
  if (!job) return null
  try { return thumbnailDataUrl(fs.readFileSync(job.image_path), 480) } catch { return null }
}

/**
 * Mark a job as added. When YOU picked what to add, that pick becomes a
 * labeled accuracy sample (prediction vs. reality); auto-adds don't count.
 */
export function acceptJob(id: number, chosen: string | null, auto: boolean): void {
  const job = getScanJob(id)
  if (!job) return
  if (!auto && chosen) {
    try {
      let predicted: string | null = null
      let confidence = job.confidence
      let source: string | null = null
      const accepted = new Set<string>()
      if (job.result_json) {
        if (job.scan_type === 'minifig') {
          const r = JSON.parse(job.result_json) as FigIdentifyResult
          source = r.model_used
          const top = r.matches[0]
          if (top) {
            predicted = top.fig_number
            confidence = top.confidence
            accepted.add(top.fig_number)
            if (top.bricklink_id) accepted.add(top.bricklink_id)
          }
        } else {
          const r = JSON.parse(job.result_json) as SetIdentifyResult
          source = r.model_used
          predicted = r.set_number
          if (r.set_number) accepted.add(stripSetSuffix(r.set_number))
          if (r.rb?.set_num) accepted.add(stripSetSuffix(r.rb.set_num))
        }
      }
      const key = job.scan_type === 'set' ? stripSetSuffix(chosen) : chosen
      insertScanEval({
        job_id: id, scan_type: job.scan_type, source, predicted, predicted_confidence: confidence,
        chosen, outcome: accepted.has(key) ? 'confirmed' : 'corrected',
      })
    } catch (err) {
      log.warn('[scan] accuracy sample failed:', err)
    }
  }
  updateScanJob(id, { status: 'added' })
  notify()
}
