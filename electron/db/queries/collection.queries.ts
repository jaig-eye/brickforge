import { getDb } from '../index'

export interface LegoSet {
  id: number
  set_number: string
  name: string
  year: number | null
  theme: string | null
  piece_count: number | null
  retail_price_usd: number | null
  image_url: string | null
  rebrickable_url: string | null
  bricklink_url: string | null
  notes: string | null
  is_owned: 0 | 1
  is_wanted: 0 | 1
  condition: 'new' | 'used' | 'sealed'
  acquired_date: string | null
  acquired_price: number | null
  created_at: string
  updated_at: string
}

export interface Minifigure {
  id: number
  fig_number: string
  name: string
  character: string | null
  theme: string | null
  year: number | null
  image_url: string | null
  bricklink_url: string | null
  notes: string | null
  is_owned: 0 | 1
  is_wanted: 0 | 1
  quantity: number
  created_at: string
  updated_at: string
}

export interface SetFilter {
  is_owned?: 0 | 1
  is_wanted?: 0 | 1
  theme?: string
  search?: string
}

// ── Sets ──────────────────────────────────────────────────────────────────────

export function listSets(filter: SetFilter = {}): LegoSet[] {
  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (filter.is_owned !== undefined) { conditions.push('is_owned = ?'); params.push(filter.is_owned) }
  if (filter.is_wanted !== undefined) { conditions.push('is_wanted = ?'); params.push(filter.is_wanted) }
  if (filter.theme) { conditions.push('theme = ?'); params.push(filter.theme) }
  if (filter.search) {
    conditions.push('(name LIKE ? OR set_number LIKE ?)')
    params.push(`%${filter.search}%`, `%${filter.search}%`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM sets ${where} ORDER BY updated_at DESC`).all(...params) as LegoSet[]
}

export function getSet(id: number): LegoSet | null {
  return (getDb().prepare('SELECT * FROM sets WHERE id = ?').get(id) ?? null) as LegoSet | null
}

export function upsertSet(data: Omit<LegoSet, 'id' | 'created_at' | 'updated_at'>): LegoSet {
  const db = getDb()
  db.prepare(`
    INSERT INTO sets (set_number, name, year, theme, piece_count, retail_price_usd,
      image_url, rebrickable_url, bricklink_url, notes, is_owned, is_wanted,
      condition, acquired_date, acquired_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(set_number) DO UPDATE SET
      name = excluded.name, year = excluded.year, theme = excluded.theme,
      piece_count = excluded.piece_count, retail_price_usd = excluded.retail_price_usd,
      image_url = excluded.image_url, rebrickable_url = excluded.rebrickable_url,
      bricklink_url = excluded.bricklink_url, notes = excluded.notes,
      is_owned = excluded.is_owned, is_wanted = excluded.is_wanted,
      condition = excluded.condition, acquired_date = excluded.acquired_date,
      acquired_price = excluded.acquired_price, updated_at = datetime('now')
  `).run(
    data.set_number, data.name, data.year, data.theme, data.piece_count,
    data.retail_price_usd, data.image_url, data.rebrickable_url, data.bricklink_url,
    data.notes, data.is_owned, data.is_wanted, data.condition,
    data.acquired_date, data.acquired_price
  )
  return db.prepare('SELECT * FROM sets WHERE set_number = ?').get(data.set_number) as LegoSet
}

export function deleteSet(id: number): void {
  getDb().prepare('DELETE FROM sets WHERE id = ?').run(id)
}

// ── Minifigures ───────────────────────────────────────────────────────────────

export function listMinifigures(filter: { is_owned?: 0 | 1; is_wanted?: 0 | 1 } = {}): Minifigure[] {
  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []
  if (filter.is_owned !== undefined) { conditions.push('is_owned = ?'); params.push(filter.is_owned) }
  if (filter.is_wanted !== undefined) { conditions.push('is_wanted = ?'); params.push(filter.is_wanted) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM minifigures ${where} ORDER BY updated_at DESC`).all(...params) as Minifigure[]
}

export function upsertMinifigure(data: Omit<Minifigure, 'id' | 'created_at' | 'updated_at'>): Minifigure {
  const db = getDb()
  db.prepare(`
    INSERT INTO minifigures (fig_number, name, character, theme, year, image_url,
      bricklink_url, notes, is_owned, is_wanted, quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fig_number) DO UPDATE SET
      name = excluded.name, character = excluded.character, theme = excluded.theme,
      year = excluded.year, image_url = excluded.image_url,
      bricklink_url = excluded.bricklink_url, notes = excluded.notes,
      is_owned = excluded.is_owned, is_wanted = excluded.is_wanted,
      quantity = excluded.quantity, updated_at = datetime('now')
  `).run(
    data.fig_number, data.name, data.character, data.theme, data.year,
    data.image_url, data.bricklink_url, data.notes,
    data.is_owned, data.is_wanted, data.quantity
  )
  return db.prepare('SELECT * FROM minifigures WHERE fig_number = ?').get(data.fig_number) as Minifigure
}

export function deleteMinifigure(id: number): void {
  getDb().prepare('DELETE FROM minifigures WHERE id = ?').run(id)
}
