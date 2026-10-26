/**
 * Prices, valuation, and alerts.
 *
 * ONE valuation rule, used by every screen:
 *  - an owned item is valued at its latest market price in the condition it's
 *    in (sealed sets → "new", everything else → "used"), times its quantity;
 *  - gain is measured only on items that have BOTH a purchase price and a
 *    market price, so items without a cost basis never inflate it.
 */
import { getDb } from '../index'
import type {
  EntityKind, PriceCondition, PricePoint, PortfolioSummary, PortfolioHistoryPoint, Mover,
  PriceAlert, AlertDirection, TriggeredAlert,
} from '../../../src/lib/types'

const r2 = (n: number) => Math.round(n * 100) / 100
const OWNED_ITEMS_SQL = `
  SELECT 'set' AS kind, set_number AS id, quantity AS qty, acquired_price AS paid,
         CASE WHEN condition = 'sealed' THEN 'new' ELSE 'used' END AS pc
  FROM sets WHERE is_owned = 1
  UNION ALL
  SELECT 'minifig', fig_number, quantity, acquired_price,
         CASE WHEN condition = 'new' THEN 'new' ELSE 'used' END
  FROM minifigures WHERE is_owned = 1`

// ── History ───────────────────────────────────────────────────────────────────

export function getPriceHistory(kind: EntityKind, id: string, days = 365): PricePoint[] {
  return getDb().prepare(`
    SELECT * FROM price_history
    WHERE entity_type = ? AND entity_id = ? AND day >= date('now', ?)
    ORDER BY day ASC
  `).all(kind, id, `-${Math.max(1, Math.floor(days))} days`) as PricePoint[]
}

export interface PriceRecord {
  entity_type: EntityKind
  entity_id: string
  condition: PriceCondition
  source: string
  avg_price: number
  min_price: number | null
  max_price: number | null
  sample_count: number | null
}

/** Record today's price; a second refresh on the same day replaces the first. */
export function recordPrice(p: PriceRecord, day?: string): void {
  getDb().prepare(`
    INSERT INTO price_history (entity_type, entity_id, source, condition, avg_price, min_price, max_price, sample_count, currency, recorded_at, day)
    VALUES (@entity_type, @entity_id, @source, @condition, @avg_price, @min_price, @max_price, @sample_count, 'USD',
            COALESCE(@at, datetime('now')), COALESCE(@day, date('now')))
    ON CONFLICT(entity_type, entity_id, condition, day) DO UPDATE SET
      source = excluded.source, avg_price = excluded.avg_price, min_price = excluded.min_price,
      max_price = excluded.max_price, sample_count = excluded.sample_count, recorded_at = excluded.recorded_at
  `).run({ ...p, day: day ?? null, at: day ? `${day} 12:00:00` : null })
}

export type LatestPrices = Record<string, { new?: number; used?: number; at?: string }>

/** Latest cached prices (both conditions) for a batch of item numbers. */
export function latestPrices(kind: EntityKind, ids: string[]): LatestPrices {
  if (!ids.length) return {}
  const out: LatestPrices = {}
  // Chunked: SQLite caps bound parameters per statement
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400)
    const rows = getDb().prepare(`
      SELECT entity_id, condition, avg_price, recorded_at FROM latest_prices
      WHERE entity_type = ? AND entity_id IN (${chunk.map(() => '?').join(',')})
    `).all(kind, ...chunk) as { entity_id: string; condition: PriceCondition; avg_price: number; recorded_at: string }[]
    for (const r of rows) {
      const e = (out[r.entity_id] ??= {})
      e[r.condition] = r.avg_price
      if (!e.at || r.recorded_at > e.at) e.at = r.recorded_at
    }
  }
  return out
}

// ── Valuation ─────────────────────────────────────────────────────────────────

export function portfolioSummary(): PortfolioSummary {
  const db = getDb()
  const rows = db.prepare(`
    WITH owned AS (${OWNED_ITEMS_SQL})
    SELECT o.kind, o.qty, o.paid, lp.avg_price AS price, lp.recorded_at AS at
    FROM owned o
    LEFT JOIN latest_prices lp ON lp.entity_type = o.kind AND lp.entity_id = o.id AND lp.condition = o.pc
  `).all() as { kind: EntityKind; qty: number; paid: number | null; price: number | null; at: string | null }[]

  let setValue = 0, figValue = 0, costBasis = 0, gainCost = 0, gainValue = 0
  let gainItems = 0, priced = 0, unpriced = 0, setsOwned = 0, figsOwned = 0
  let lastAt: string | null = null
  for (const r of rows) {
    const qty = Math.max(1, r.qty || 1)
    if (r.kind === 'set') setsOwned += qty
    else figsOwned += qty
    if (r.paid != null) costBasis += r.paid * qty
    if (r.price == null) { unpriced++; continue }
    priced++
    if (r.kind === 'set') setValue += r.price * qty
    else figValue += r.price * qty
    if (r.paid != null) {
      gainItems++
      gainCost += r.paid * qty
      gainValue += r.price * qty
    }
    if (r.at && (!lastAt || r.at > lastAt)) lastAt = r.at
  }
  const wanted = db.prepare(`
    SELECT (SELECT COUNT(*) FROM sets WHERE is_wanted = 1 AND is_owned = 0)
         + (SELECT COUNT(*) FROM minifigures WHERE is_wanted = 1 AND is_owned = 0) AS n
  `).get() as { n: number }

  const gain = gainItems ? r2(gainValue - gainCost) : null
  return {
    total_value: r2(setValue + figValue),
    set_value: r2(setValue),
    fig_value: r2(figValue),
    cost_basis: r2(costBasis),
    gain,
    gain_pct: gain != null && gainCost > 0 ? Math.round((gain / gainCost) * 1000) / 10 : null,
    gain_items: gainItems,
    sets_owned: setsOwned,
    figs_owned: figsOwned,
    priced_items: priced,
    unpriced_items: unpriced,
    wanted_count: wanted.n,
    last_priced_at: lastAt,
  }
}

/**
 * Collection value per day: every owned item at its most recent price as of
 * that day (forward-filled), times quantity. One indexed scan plus a JS pass.
 */
export function portfolioHistory(days = 365): PortfolioHistoryPoint[] {
  const db = getDb()
  const since = `-${Math.max(1, Math.floor(days))} days`
  const owned = db.prepare(OWNED_ITEMS_SQL).all() as { kind: EntityKind; id: string; qty: number; pc: PriceCondition }[]
  if (!owned.length) return []
  const key = (k: string, id: string, c: string) => `${k}\u0000${id}\u0000${c}`
  const wanted = new Map(owned.map((o) => [key(o.kind, o.id, o.pc), o]))

  // Baseline: latest price before the window, so the line doesn't start at 0
  const baseline = db.prepare(`
    SELECT entity_type, entity_id, condition, avg_price FROM price_history p
    WHERE day < date('now', ?) AND day = (
      SELECT MAX(day) FROM price_history q
      WHERE q.entity_type = p.entity_type AND q.entity_id = p.entity_id AND q.condition = p.condition AND q.day < date('now', ?)
    )
  `).all(since, since) as { entity_type: string; entity_id: string; condition: string; avg_price: number }[]
  const points = db.prepare(`
    SELECT entity_type, entity_id, condition, avg_price, day FROM price_history
    WHERE day >= date('now', ?) ORDER BY day ASC
  `).all(since) as { entity_type: string; entity_id: string; condition: string; avg_price: number; day: string }[]

  const current = new Map<string, number>()
  for (const b of baseline) {
    const k = key(b.entity_type, b.entity_id, b.condition)
    if (wanted.has(k)) current.set(k, b.avg_price)
  }
  const hadBaseline = current.size > 0
  // Items first priced inside the window count at that first price for the
  // days before it — otherwise the line would "grow" every time something
  // got its first price, which is coverage, not value.
  for (const p of points) {
    const k = key(p.entity_type, p.entity_id, p.condition)
    if (wanted.has(k) && !current.has(k)) current.set(k, p.avg_price)
  }
  const out: PortfolioHistoryPoint[] = []
  const flush = (day: string) => {
    let sets = 0, figs = 0
    for (const [k, o] of wanted) {
      const price = current.get(k)
      if (price == null) continue
      if (o.kind === 'set') sets += price * Math.max(1, o.qty)
      else figs += price * Math.max(1, o.qty)
    }
    out.push({ day, set_value: r2(sets), fig_value: r2(figs), total: r2(sets + figs) })
  }
  // The line spans the whole window: it opens at the last prices known before
  // it and runs on to today, even when only one update falls inside it
  const { start, today } = db.prepare(`SELECT date('now', ?) AS start, date('now') AS today`).get(since) as { start: string; today: string }
  if (hadBaseline && (!points.length || points[0].day > start)) flush(start)
  let day: string | null = null
  for (const p of points) {
    if (day !== null && p.day !== day) flush(day)
    day = p.day
    const k = key(p.entity_type, p.entity_id, p.condition)
    if (wanted.has(k)) current.set(k, p.avg_price)
  }
  if (day !== null) flush(day)
  if (out.length && out[out.length - 1].day < today) flush(today)
  return out
}

/**
 * Biggest price changes among owned items: latest price vs. the price at the
 * start of the window (or the earliest one inside it).
 */
export function movers(days = 30, limit = 8): Mover[] {
  const db = getDb()
  const cutoff = (db.prepare(`SELECT date('now', ?) AS d`).get(`-${Math.max(1, Math.floor(days))} days`) as { d: string }).d
  const rows = db.prepare(`
    WITH owned AS (${OWNED_ITEMS_SQL})
    SELECT o.kind, o.id, o.pc, p.avg_price, p.day,
           COALESCE(s.name, m.name) AS name, COALESCE(s.image_url, m.image_url) AS image_url
    FROM owned o
    JOIN price_history p ON p.entity_type = o.kind AND p.entity_id = o.id AND p.condition = o.pc
    LEFT JOIN sets s ON o.kind = 'set' AND s.set_number = o.id
    LEFT JOIN minifigures m ON o.kind = 'minifig' AND m.fig_number = o.id
    ORDER BY o.kind, o.id, p.day
  `).all() as { kind: EntityKind; id: string; pc: PriceCondition; avg_price: number; day: string; name: string | null; image_url: string | null }[]

  const byItem = new Map<string, typeof rows>()
  for (const r of rows) {
    const k = `${r.kind}\u0000${r.id}`
    const list = byItem.get(k) ?? []
    list.push(r)
    byItem.set(k, list)
  }
  const out: Mover[] = []
  for (const list of byItem.values()) {
    const latest = list[list.length - 1]
    const before = [...list].reverse().find((p) => p.day <= cutoff) ?? list[0]
    if (before === latest || before.avg_price <= 0 || before.avg_price === latest.avg_price) continue
    const delta = r2(latest.avg_price - before.avg_price)
    out.push({
      entity_type: latest.kind, entity_id: latest.id, name: latest.name, image_url: latest.image_url,
      condition: latest.pc, latest: latest.avg_price, previous: before.avg_price,
      delta, pct: Math.round((delta / before.avg_price) * 1000) / 10, since: before.day,
    })
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limit)
}

/** Owned and wanted items that should get prices on a refresh. */
export function itemsToPrice(): { kind: EntityKind; id: string; bricklink_id: string | null; condition: PriceCondition; name: string }[] {
  return getDb().prepare(`
    SELECT 'set' AS kind, set_number AS id, NULL AS bricklink_id, name,
           CASE WHEN condition = 'sealed' THEN 'new' ELSE 'used' END AS condition
    FROM sets WHERE is_owned = 1 OR is_wanted = 1
    UNION ALL
    SELECT 'minifig', fig_number, bricklink_id, name,
           CASE WHEN condition = 'new' THEN 'new' ELSE 'used' END
    FROM minifigures WHERE is_owned = 1 OR is_wanted = 1
    UNION
    SELECT a.entity_type, a.entity_id, m.bricklink_id, COALESCE(s.name, m.name, a.entity_id), a.condition
    FROM price_alerts a
    LEFT JOIN sets s ON a.entity_type = 'set' AND s.set_number = a.entity_id
    LEFT JOIN minifigures m ON a.entity_type = 'minifig' AND m.fig_number = a.entity_id
    WHERE a.is_active = 1
  `).all() as { kind: EntityKind; id: string; bricklink_id: string | null; condition: PriceCondition; name: string }[]
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export function listAlerts(): PriceAlert[] {
  return getDb().prepare(`
    SELECT a.*, COALESCE(s.name, m.name) AS name, COALESCE(s.image_url, m.image_url) AS image_url,
           lp.avg_price AS current_price
    FROM price_alerts a
    LEFT JOIN sets s ON a.entity_type = 'set' AND s.set_number = a.entity_id
    LEFT JOIN minifigures m ON a.entity_type = 'minifig' AND m.fig_number = a.entity_id
    LEFT JOIN latest_prices lp ON lp.entity_type = a.entity_type AND lp.entity_id = a.entity_id AND lp.condition = a.condition
    ORDER BY a.triggered_at IS NULL, a.triggered_at DESC, a.created_at DESC
  `).all() as PriceAlert[]
}

export function setAlert(a: { entity_type: EntityKind; entity_id: string; condition: PriceCondition; direction: AlertDirection; target_price: number }): PriceAlert {
  if (!(a.target_price > 0)) throw new Error('Enter a target price above $0.')
  const db = getDb()
  db.prepare(`
    INSERT INTO price_alerts (entity_type, entity_id, condition, direction, target_price, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(entity_type, entity_id, condition, direction) DO UPDATE SET
      target_price = excluded.target_price, is_active = 1, triggered_at = NULL
  `).run(a.entity_type, a.entity_id, a.condition, a.direction === 'above' ? 'above' : 'below', r2(a.target_price))
  return listAlerts().find((x) => x.entity_type === a.entity_type && x.entity_id === a.entity_id
    && x.condition === a.condition && x.direction === a.direction) as PriceAlert
}

export function deleteAlert(id: number): void {
  getDb().prepare('DELETE FROM price_alerts WHERE id = ?').run(id)
}

/** Arm a triggered alert again so it can fire on the next crossing. */
export function rearmAlert(id: number): void {
  getDb().prepare('UPDATE price_alerts SET triggered_at = NULL, is_active = 1 WHERE id = ?').run(id)
}

/** Fire every active alert whose price has crossed its target; returns the ones that fired. */
export function evaluateAlerts(): TriggeredAlert[] {
  const db = getDb()
  const due = db.prepare(`
    SELECT a.*, lp.avg_price AS current_price, COALESCE(s.name, m.name) AS name, COALESCE(s.image_url, m.image_url) AS image_url
    FROM price_alerts a
    JOIN latest_prices lp ON lp.entity_type = a.entity_type AND lp.entity_id = a.entity_id AND lp.condition = a.condition
    LEFT JOIN sets s ON a.entity_type = 'set' AND s.set_number = a.entity_id
    LEFT JOIN minifigures m ON a.entity_type = 'minifig' AND m.fig_number = a.entity_id
    WHERE a.is_active = 1 AND a.triggered_at IS NULL
      AND ((a.direction = 'below' AND lp.avg_price <= a.target_price)
        OR (a.direction = 'above' AND lp.avg_price >= a.target_price))
  `).all() as TriggeredAlert[]
  const mark = db.prepare("UPDATE price_alerts SET triggered_at = datetime('now') WHERE id = ?")
  db.transaction(() => { for (const a of due) mark.run(a.id) })()
  return due
}
