import fs from 'fs'
import path from 'path'
import { openDb, backupDb } from './index'
import log from '../main/logger'

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

/**
 * Apply pending SQL migrations in filename order. Each file runs inside its
 * own transaction together with its bookkeeping row, so a failure leaves the
 * database exactly as it was before that file — never half-migrated.
 */
export async function runMigrations(dir = MIGRATIONS_DIR): Promise<void> {
  const db = openDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT filename FROM _migrations').all() as { filename: string }[])
      .map((r) => r.filename)
  )

  const pending = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !applied.has(f))
  if (pending.length === 0) return

  // Snapshot before touching the schema — a failed ALTER can't cost the collection
  await backupDb('pre-migration')

  const record = db.prepare('INSERT INTO _migrations (filename) VALUES (?)')
  for (const file of pending) {
    log.info(`[migrate] Applying ${file}`)
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      record.run(file)
    })()
    log.info(`[migrate] Applied ${file}`)
  }
}
