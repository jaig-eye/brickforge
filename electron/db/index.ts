import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import log from '../main/logger'
import type { BackupInfo } from '../../src/lib/types'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call openDb() first')
  return db
}

export function dbPath(): string {
  return path.join(app.getPath('userData'), 'brickforge.db')
}

export function openDb(): Database.Database {
  const p = dbPath()
  log.info('Opening database at', p)
  db = new Database(p)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

const BACKUP_DIR = () => path.join(app.getPath('userData'), 'backups')
const MAX_BACKUPS = 8

/**
 * Snapshot the live database into userData/backups/ using SQLite's online
 * backup (safe under WAL). Rotates old snapshots, keeping the newest MAX_BACKUPS.
 * Returns the backup file path, or null on failure (backups must never block the app).
 */
export async function backupDb(label = 'auto'): Promise<string | null> {
  try {
    const dir = BACKUP_DIR()
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
    const dest = path.join(dir, `brickforge-${label}-${stamp}.db`)
    if (db) {
      await db.backup(dest)
    } else if (fs.existsSync(dbPath())) {
      fs.copyFileSync(dbPath(), dest) // pre-open fallback (no WAL writers yet)
    } else {
      return null // nothing to back up (first run)
    }
    // Rotate oldest-first by modification time — filenames mix labels
    // (auto/manual/pre-migration), so a lexicographic sort would rotate out
    // the wrong (even the newest) snapshots.
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('brickforge-') && f.endsWith('.db'))
      .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => a.mtime - b.mtime)
    for (const { f } of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
      try { fs.unlinkSync(path.join(dir, f)) } catch { /* best effort */ }
    }
    log.info('[backup] snapshot written:', dest)
    return dest
  } catch (err) {
    log.warn('[backup] failed:', err)
    return null
  }
}

/** Snapshots in userData/backups, newest first. Paths stay in the main process. */
export function listBackups(): BackupInfo[] {
  try {
    const dir = BACKUP_DIR()
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f))
        const label = /^brickforge-(.+?)-\d{4}-\d{2}-\d{2}/.exec(f)?.[1] ?? 'backup'
        return { name: f, size: st.size, mtime: st.mtime.toISOString(), label }
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime))
  } catch {
    return []
  }
}

/** The full path of a backup by file name — only names inside the backups folder resolve. */
export function backupPath(name: string): string | null {
  if (!/^[\w.-]+\.db$/.test(name)) return null
  const p = path.join(BACKUP_DIR(), name)
  return fs.existsSync(p) ? p : null
}

/**
 * Replace the live database with the given backup file.
 * Takes a safety snapshot of the current DB first, then swaps and reopens.
 */
export async function restoreDb(backupPath: string): Promise<void> {
  if (!fs.existsSync(backupPath)) throw new Error('Backup file not found')
  // Sanity check: SQLite header
  const header = Buffer.alloc(16)
  const fd = fs.openSync(backupPath, 'r')
  try { fs.readSync(fd, header, 0, 16, 0) } finally { fs.closeSync(fd) }
  if (!header.toString('utf8').startsWith('SQLite format 3')) {
    throw new Error('Selected file is not a SQLite database')
  }
  await backupDb('pre-restore')
  closeDb()
  // Remove WAL/SHM so the restored file opens clean
  for (const suffix of ['-wal', '-shm']) {
    try { fs.unlinkSync(dbPath() + suffix) } catch { /* may not exist */ }
  }
  fs.copyFileSync(backupPath, dbPath())
  // Leave the DB closed — the caller must runMigrations() next, which reopens
  // it and brings an older-schema backup up to date before anything queries it.
  log.info('[backup] restored from', backupPath)
}
