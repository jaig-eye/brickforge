import crypto from 'crypto'
import { getDb } from '../index'
import type { ListingHistoryEntry } from '../../../src/lib/types'

export function listListings(limit = 100): ListingHistoryEntry[] {
  return getDb().prepare('SELECT * FROM listing_history ORDER BY created_at DESC, id DESC LIMIT ?').all(limit) as ListingHistoryEntry[]
}

export function getListing(id: number): ListingHistoryEntry | null {
  return (getDb().prepare('SELECT * FROM listing_history WHERE id = ?').get(id) ?? null) as ListingHistoryEntry | null
}

export function saveListing(data: Omit<ListingHistoryEntry, 'id' | 'uid' | 'created_at'>): ListingHistoryEntry {
  const db = getDb()
  const info = db.prepare(`
    INSERT INTO listing_history (uid, set_number, set_name, year, title, description, provider)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID().replace(/-/g, ''), data.set_number, data.set_name, data.year ?? null, data.title, data.description, data.provider ?? null)
  return getListing(Number(info.lastInsertRowid))!
}

export function deleteListing(id: number): void {
  getDb().prepare('DELETE FROM listing_history WHERE id = ?').run(id)
}
