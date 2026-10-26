/**
 * Quiet housekeeping after startup: a weekly safety backup, one-time carry-over
 * of old settings, scan-photo cleanup, and catalog enrichment.
 */
import log from '../main/logger'
import { readSettings, writeSettings } from '../main/settings-store'
import { getDb, backupDb } from '../db/index'
import { hasRebrickableKey } from '../api/rebrickable'
import { cleanOrphanScanFiles } from './scan-queue'
import { enrichCollection } from './catalog'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function weeklyBackup(): Promise<void> {
  const last = readSettings().lastWeeklyBackupAt
  if (last && Date.now() - Date.parse(last) < WEEK_MS) return
  if (await backupDb('weekly')) writeSettings({ lastWeeklyBackupAt: new Date().toISOString() })
}

/** Carry the old Profile page's display name into Settings, once. */
function carryOverProfile(): void {
  const s = readSettings()
  if (s.displayName !== undefined) return
  try {
    const row = getDb().prepare('SELECT display_name FROM profiles WHERE id = 1').get() as { display_name?: string } | undefined
    const name = row?.display_name && row.display_name !== 'Brick Builder' ? row.display_name : ''
    writeSettings({ displayName: name })
  } catch {
    writeSettings({ displayName: '' })
  }
}

export function runStartupMaintenance(): void {
  carryOverProfile()
  setTimeout(() => {
    void weeklyBackup().catch((err) => log.warn('[maintenance] weekly backup failed:', err))
    cleanOrphanScanFiles()
  }, 8_000)
  setTimeout(() => {
    if (hasRebrickableKey()) void enrichCollection().catch(() => undefined)
  }, 30_000)
}
