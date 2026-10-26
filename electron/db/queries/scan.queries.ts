import { getDb } from '../index'
import type { ScanJob, ScanType, ScanStatus, ScanEvalStats } from '../../../src/lib/types'

/** A job row as stored — the renderer gets ScanJob (no local file path). */
export interface ScanJobRow {
  id: number
  scan_type: ScanType
  image_path: string
  image_hash: string | null
  status: ScanStatus
  result_json: string | null
  confidence: number | null
  error: string | null
  is_crop: 0 | 1
  split_pending: 0 | 1
  created_at: string
  updated_at: string
}

export function toScanJob(row: ScanJobRow): ScanJob {
  const { image_path: _path, result_json, ...rest } = row
  let result: ScanJob['result'] = null
  if (result_json) {
    try { result = JSON.parse(result_json) } catch { result = null }
  }
  return { ...rest, result }
}

export function enqueueScanJob(scanType: ScanType, imagePath: string, imageHash: string | null, opts: { isCrop?: boolean; split?: boolean } = {}): ScanJobRow {
  const db = getDb()
  const info = db.prepare(
    'INSERT INTO scan_jobs (scan_type, image_path, image_hash, is_crop, split_pending) VALUES (?, ?, ?, ?, ?)',
  ).run(scanType, imagePath, imageHash, opts.isCrop ? 1 : 0, opts.split ? 1 : 0)
  return db.prepare('SELECT * FROM scan_jobs WHERE id = ?').get(info.lastInsertRowid) as ScanJobRow
}

export function listScanJobs(limit = 200): ScanJob[] {
  return (getDb().prepare(
    "SELECT * FROM scan_jobs WHERE status != 'dismissed' ORDER BY id DESC LIMIT ?",
  ).all(limit) as ScanJobRow[]).map(toScanJob)
}

export function nextQueuedJob(): ScanJobRow | null {
  return (getDb().prepare(
    "SELECT * FROM scan_jobs WHERE status = 'queued' ORDER BY id ASC LIMIT 1",
  ).get() ?? null) as ScanJobRow | null
}

export function getScanJob(id: number): ScanJobRow | null {
  return (getDb().prepare('SELECT * FROM scan_jobs WHERE id = ?').get(id) ?? null) as ScanJobRow | null
}

/**
 * Patch a job. scan_type + result_json + confidence MUST be written in ONE
 * call when a fig scan is rerouted to set identification: the renderer reads
 * the result by scan_type, and a split write would render a set result as a fig.
 */
export function updateScanJob(id: number, patch: Partial<Pick<ScanJobRow, 'status' | 'result_json' | 'confidence' | 'error' | 'scan_type' | 'split_pending'>>): void {
  const allowed = new Set(['status', 'result_json', 'confidence', 'error', 'scan_type', 'split_pending'])
  const entries = Object.entries(patch).filter(([k, v]) => allowed.has(k) && v !== undefined)
  if (!entries.length) return
  getDb().prepare(
    `UPDATE scan_jobs SET ${entries.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
  ).run(...entries.map(([, v]) => v), id)
}

/** Jobs left 'running' by a previous session go back in the queue. */
export function resetStuckJobs(): number {
  return getDb().prepare("UPDATE scan_jobs SET status = 'queued' WHERE status = 'running'").run().changes
}

/**
 * Delete finished jobs (or the given ones) and return image paths no longer
 * used by any remaining job, so the caller can delete the files.
 */
export function deleteScanJobs(which: 'finished' | number[]): string[] {
  const db = getDb()
  return db.transaction(() => {
    const rows = which === 'finished'
      ? db.prepare("SELECT id, image_path FROM scan_jobs WHERE status IN ('done', 'error', 'added', 'dismissed')").all() as { id: number; image_path: string }[]
      : which.map((id) => db.prepare('SELECT id, image_path FROM scan_jobs WHERE id = ?').get(id) as { id: number; image_path: string } | undefined)
          .filter((r): r is { id: number; image_path: string } => !!r)
    const del = db.prepare('DELETE FROM scan_jobs WHERE id = ?')
    for (const r of rows) del.run(r.id)
    const stillUsed = db.prepare('SELECT 1 FROM scan_jobs WHERE image_path = ? LIMIT 1')
    return [...new Set(rows.map((r) => r.image_path))].filter((p) => !stillUsed.get(p))
  })()
}

/** Every image path a job still references (for orphan-file cleanup). */
export function referencedScanImages(): Set<string> {
  return new Set((getDb().prepare('SELECT DISTINCT image_path FROM scan_jobs').all() as { image_path: string }[]).map((r) => r.image_path))
}

// ── Accuracy ground truth ─────────────────────────────────────────────────────

export interface ScanEvalRecord {
  job_id: number
  scan_type: string
  source: string | null
  predicted: string | null
  predicted_confidence: number | null
  chosen: string
  outcome: 'confirmed' | 'corrected'
}

/** One labeled sample per scan job: a second pick replaces the first. */
export function insertScanEval(record: ScanEvalRecord): void {
  getDb().prepare(`
    INSERT INTO scan_evals (job_id, scan_type, source, predicted, predicted_confidence, chosen, outcome)
    VALUES (@job_id, @scan_type, @source, @predicted, @predicted_confidence, @chosen, @outcome)
    ON CONFLICT(job_id) DO UPDATE SET chosen = excluded.chosen, outcome = excluded.outcome, created_at = datetime('now')
  `).run(record)
}

export function getScanEvalStats(): ScanEvalStats {
  const db = getDb()
  const overall = db.prepare(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN outcome = 'confirmed' THEN 1 ELSE 0 END) AS confirmed FROM scan_evals
  `).get() as { total: number; confirmed: number | null }
  const bySource = db.prepare(`
    SELECT source, COUNT(*) AS total, SUM(CASE WHEN outcome = 'confirmed' THEN 1 ELSE 0 END) AS confirmed
    FROM scan_evals GROUP BY source ORDER BY total DESC
  `).all() as ScanEvalStats['bySource']
  const confirmed = overall.confirmed ?? 0
  return { total: overall.total, confirmed, accuracy: overall.total ? confirmed / overall.total : null, bySource }
}
