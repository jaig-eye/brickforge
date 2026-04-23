import { getDb } from '../index'

export interface PricePoint {
  id: number
  entity_type: string
  entity_id: string
  source: string
  condition: string
  avg_price: number
  min_price: number | null
  max_price: number | null
  sample_count: number | null
  currency: string
  recorded_at: string
}

export interface PriceAlert {
  id: number
  entity_type: string
  entity_id: string
  target_price: number
  condition: string
  is_active: 0 | 1
  triggered_at: string | null
  created_at: string
}

export function getPriceHistory(entityType: string, entityId: string): PricePoint[] {
  return getDb().prepare(
    'SELECT * FROM price_history WHERE entity_type = ? AND entity_id = ? ORDER BY recorded_at DESC LIMIT 90'
  ).all(entityType, entityId) as PricePoint[]
}

export function insertPricePoint(data: Omit<PricePoint, 'id' | 'recorded_at'>): void {
  getDb().prepare(`
    INSERT INTO price_history (entity_type, entity_id, source, condition, avg_price, min_price, max_price, sample_count, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.entity_type, data.entity_id, data.source, data.condition,
    data.avg_price, data.min_price, data.max_price, data.sample_count, data.currency)
}

export function listAlerts(): PriceAlert[] {
  return getDb().prepare('SELECT * FROM price_alerts ORDER BY created_at DESC').all() as PriceAlert[]
}

export function upsertAlert(data: Omit<PriceAlert, 'id' | 'created_at' | 'triggered_at'>): PriceAlert {
  const db = getDb()
  const info = db.prepare(`
    INSERT INTO price_alerts (entity_type, entity_id, target_price, condition, is_active)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.entity_type, data.entity_id, data.target_price, data.condition, data.is_active)
  return db.prepare('SELECT * FROM price_alerts WHERE id = ?').get(info.lastInsertRowid) as PriceAlert
}
