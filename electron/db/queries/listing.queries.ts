import { getDb } from '../index'

export interface ListingHistoryEntry {
  id: number
  set_number: string
  set_name: string
  year: number | null
  title: string
  description: string
  provider: string | null
  created_at: string
}

export function getListingHistory(): ListingHistoryEntry[] {
  return getDb()
    .prepare('SELECT * FROM listing_history ORDER BY created_at DESC LIMIT 50')
    .all() as ListingHistoryEntry[]
}

export function saveListingHistory(data: Omit<ListingHistoryEntry, 'id' | 'created_at'>): void {
  getDb().prepare(`
    INSERT INTO listing_history (set_number, set_name, year, title, description, provider)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(data.set_number, data.set_name, data.year ?? null, data.title, data.description, data.provider ?? null)
}

export function deleteListingHistory(id: number): void {
  getDb().prepare('DELETE FROM listing_history WHERE id = ?').run(id)
}
