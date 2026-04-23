import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import log from '../main/logger'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call openDb() first')
  return db
}

export function openDb(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'brickforge.db')
  log.info('Opening database at', dbPath)
  db = new Database(dbPath)
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
