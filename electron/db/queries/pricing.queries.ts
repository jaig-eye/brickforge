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

export interface PortfolioStats {
  // Sets
  used_value: number
  new_value: number
  acquired_total: number
  retail_total: number
  set_count: number
  wanted_count: number
  priced_count: number
  // Minifigs
  minifig_count: number
  fig_used_value: number
  fig_new_value: number
  fig_acquired_total: number
  fig_priced_count: number
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

/** Get latest cached prices for a batch of sets. Returns map of set_number → { new?, used? }. */
export function getBulkLatestPrices(setNums: string[]): Record<string, { new?: number; used?: number }> {
  if (!setNums.length) return {}
  const placeholders = setNums.map(() => '?').join(',')
  const rows = getDb().prepare(`
    WITH latest AS (
      SELECT entity_id, condition, avg_price,
             ROW_NUMBER() OVER (PARTITION BY entity_id, condition ORDER BY recorded_at DESC) AS rn
      FROM price_history
      WHERE entity_type = 'set' AND entity_id IN (${placeholders})
    )
    SELECT entity_id, condition, avg_price FROM latest WHERE rn = 1
  `).all(...setNums) as { entity_id: string; condition: string; avg_price: number }[]

  const result: Record<string, { new?: number; used?: number }> = {}
  for (const row of rows) {
    if (!result[row.entity_id]) result[row.entity_id] = {}
    if (row.condition === 'new')  result[row.entity_id].new  = row.avg_price
    if (row.condition === 'used') result[row.entity_id].used = row.avg_price
  }
  return result
}

/** Get latest cached prices for a batch of minifigures. Returns map of fig_number → { new?, used? }. */
export function getBulkLatestFigPrices(figNums: string[]): Record<string, { new?: number; used?: number }> {
  if (!figNums.length) return {}
  const placeholders = figNums.map(() => '?').join(',')
  const rows = getDb().prepare(`
    WITH latest AS (
      SELECT entity_id, condition, avg_price,
             ROW_NUMBER() OVER (PARTITION BY entity_id, condition ORDER BY recorded_at DESC) AS rn
      FROM price_history
      WHERE entity_type = 'minifig' AND entity_id IN (${placeholders})
    )
    SELECT entity_id, condition, avg_price FROM latest WHERE rn = 1
  `).all(...figNums) as { entity_id: string; condition: string; avg_price: number }[]

  const result: Record<string, { new?: number; used?: number }> = {}
  for (const row of rows) {
    if (!result[row.entity_id]) result[row.entity_id] = {}
    if (row.condition === 'new')  result[row.entity_id].new  = row.avg_price
    if (row.condition === 'used') result[row.entity_id].used = row.avg_price
  }
  return result
}

/** Portfolio totals across all owned sets and minifigures using cached prices. */
export function getPortfolioStats(): PortfolioStats {
  const result = getDb().prepare(`
    WITH set_latest AS (
      SELECT entity_id, condition, avg_price,
             ROW_NUMBER() OVER (PARTITION BY entity_id, condition ORDER BY recorded_at DESC) AS rn
      FROM price_history WHERE entity_type = 'set'
    ),
    fig_latest AS (
      SELECT entity_id, condition, avg_price,
             ROW_NUMBER() OVER (PARTITION BY entity_id, condition ORDER BY recorded_at DESC) AS rn
      FROM price_history WHERE entity_type = 'minifig'
    )
    SELECT
      -- Sets
      COUNT(s.id)                              AS set_count,
      COALESCE(SUM(s.acquired_price), 0)       AS acquired_total,
      COALESCE(SUM(s.retail_price_usd), 0)     AS retail_total,
      COALESCE(SUM(sl_used.avg_price), 0)      AS used_value,
      COALESCE(SUM(sl_new.avg_price),  0)      AS new_value,
      COUNT(CASE WHEN sl_used.avg_price IS NOT NULL
                   OR sl_new.avg_price  IS NOT NULL
               THEN 1 END)                     AS priced_count,
      (SELECT COUNT(*) FROM sets WHERE is_wanted = 1)                         AS wanted_count,
      -- Minifigs
      (SELECT COALESCE(SUM(quantity), 0) FROM minifigures WHERE is_owned = 1) AS minifig_count,
      (SELECT COALESCE(SUM(acquired_price), 0) FROM minifigures WHERE is_owned = 1) AS fig_acquired_total,
      COALESCE((
        SELECT SUM(fl_used.avg_price)
        FROM minifigures mf
        JOIN (SELECT entity_id, avg_price FROM fig_latest WHERE condition = 'used' AND rn = 1) fl_used
          ON fl_used.entity_id = mf.fig_number
        WHERE mf.is_owned = 1
      ), 0) AS fig_used_value,
      COALESCE((
        SELECT SUM(fl_new.avg_price)
        FROM minifigures mf
        JOIN (SELECT entity_id, avg_price FROM fig_latest WHERE condition = 'new' AND rn = 1) fl_new
          ON fl_new.entity_id = mf.fig_number
        WHERE mf.is_owned = 1
      ), 0) AS fig_new_value,
      (
        SELECT COUNT(DISTINCT mf2.fig_number)
        FROM minifigures mf2
        WHERE mf2.is_owned = 1
          AND EXISTS (
            SELECT 1 FROM price_history ph
            WHERE ph.entity_type = 'minifig' AND ph.entity_id = mf2.fig_number
          )
      ) AS fig_priced_count
    FROM sets s
    LEFT JOIN (SELECT entity_id, avg_price FROM set_latest WHERE condition = 'used' AND rn = 1) sl_used
           ON sl_used.entity_id = s.set_number
    LEFT JOIN (SELECT entity_id, avg_price FROM set_latest WHERE condition = 'new'  AND rn = 1) sl_new
           ON sl_new.entity_id  = s.set_number
    WHERE s.is_owned = 1
  `).get() as PortfolioStats | undefined
  return result ?? {
    used_value: 0, new_value: 0, acquired_total: 0, retail_total: 0,
    set_count: 0, wanted_count: 0, priced_count: 0,
    minifig_count: 0, fig_used_value: 0, fig_new_value: 0,
    fig_acquired_total: 0, fig_priced_count: 0,
  }
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
