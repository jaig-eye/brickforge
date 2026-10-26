/**
 * What sync moves, and how a row becomes JSON and back.
 *
 * Only the tables and columns listed here ever leave or enter the database:
 * the local integer ids stay local (tag links carry the tag's name instead),
 * and everything pulled from the server is checked against these specs before
 * it reaches SQL, because the server is shared and may hold rows written by
 * another version of BrickForge, or by anything else with the password.
 */
import type Database from 'better-sqlite3'
import { normalizeFigCondition, normalizeSetCondition } from '../../src/lib/conditions'

export type SyncTable =
  | 'sets' | 'minifigures' | 'price_history' | 'price_alerts' | 'tags' | 'item_tags' | 'listing_history'

type Value = string | number | null

interface Column {
  type: 'text' | 'int' | 'real'
  /** NULL allowed (matches the column's SQLite definition). */
  nullable?: boolean
  max?: number
  oneOf?: readonly string[]
  /** Map any text onto the app's canonical values instead of rejecting it. */
  normalize?: (v: string) => string
}

interface TableSpec {
  /** Natural key columns, in key order. */
  key: readonly string[]
  /** Every synced column, key columns included. */
  columns: Readonly<Record<string, Column>>
  /**
   * Timestamp (ms) for rows that predate change tracking: the row's own
   * edit time where it has one, so when two PCs both already had a row
   * before connecting, the more recently edited copy wins.
   */
  backfillTs: string
}

const KINDS = ['set', 'minifig'] as const
const PRICE_CONDITIONS = ['new', 'used'] as const

const text = (max = 500, nullable = true): Column => ({ type: 'text', max, nullable })
const int = (nullable = true): Column => ({ type: 'int', nullable })
const real = (nullable = true): Column => ({ type: 'real', nullable })
const stamp = (nullable = false): Column => ({ type: 'text', max: 40, nullable })
const msFrom = (col: string) => `COALESCE(CAST(unixepoch(${col}) * 1000 AS INTEGER), 0)`

export const TABLES: Readonly<Record<SyncTable, TableSpec>> = {
  sets: {
    key: ['set_number'],
    columns: {
      set_number: text(100, false), name: text(1000, false), year: int(), theme: text(200), piece_count: int(),
      retail_price_usd: real(), image_url: text(2000), rebrickable_url: text(2000), bricklink_url: text(2000),
      notes: text(20_000), is_owned: int(false), is_wanted: int(false),
      condition: { type: 'text', max: 40, normalize: normalizeSetCondition },
      acquired_date: text(40), acquired_price: real(), quantity: int(false),
      has_box: int(), has_instructions: int(), missing_parts: text(20_000),
      created_at: stamp(), updated_at: stamp(),
    },
    backfillTs: msFrom('updated_at'),
  },
  minifigures: {
    key: ['fig_number'],
    columns: {
      fig_number: text(100, false), name: text(1000, false), character: text(1000), theme: text(200), year: int(),
      image_url: text(2000), bricklink_url: text(2000), bricklink_id: text(100), notes: text(20_000),
      is_owned: int(false), is_wanted: int(false), quantity: int(false),
      condition: { type: 'text', max: 40, normalize: normalizeFigCondition },
      acquired_price: real(), acquired_date: text(40), created_at: stamp(), updated_at: stamp(),
    },
    backfillTs: msFrom('updated_at'),
  },
  price_history: {
    key: ['entity_type', 'entity_id', 'condition', 'day'],
    columns: {
      entity_type: { type: 'text', oneOf: KINDS }, entity_id: text(100, false),
      condition: { type: 'text', oneOf: PRICE_CONDITIONS }, day: text(10, false),
      source: text(40, false), avg_price: real(false), min_price: real(), max_price: real(),
      sample_count: int(), currency: text(8, false), recorded_at: stamp(),
    },
    backfillTs: msFrom('recorded_at'),
  },
  price_alerts: {
    key: ['entity_type', 'entity_id', 'condition', 'direction'],
    columns: {
      entity_type: { type: 'text', oneOf: KINDS }, entity_id: text(100, false),
      condition: { type: 'text', oneOf: PRICE_CONDITIONS }, direction: { type: 'text', oneOf: ['below', 'above'] },
      target_price: real(false), is_active: int(false), triggered_at: stamp(true), created_at: stamp(),
    },
    backfillTs: msFrom('COALESCE(triggered_at, created_at)'),
  },
  tags: {
    key: ['name'],
    columns: { name: text(200, false), color: text(40), created_at: stamp() },
    backfillTs: msFrom('created_at'),
  },
  // Not a real column set: `tag` is the tag's name, resolved to a local id on apply
  item_tags: {
    key: ['entity_type', 'entity_id', 'tag'],
    columns: { entity_type: { type: 'text', oneOf: KINDS }, entity_id: text(100, false), tag: text(200, false) },
    backfillTs: '0',
  },
  listing_history: {
    key: ['uid'],
    columns: {
      uid: text(64, false), set_number: text(100, false), set_name: text(1000, false), year: int(),
      title: text(1000, false), description: text(100_000, false), provider: text(60), created_at: stamp(),
    },
    backfillTs: msFrom('created_at'),
  },
}

/** Tags go first so tag links can always find their tag. */
export const TABLE_ORDER: readonly SyncTable[] = [
  'tags', 'sets', 'minifigures', 'item_tags', 'price_history', 'price_alerts', 'listing_history',
]

export const isSyncTable = (t: unknown): t is SyncTable => typeof t === 'string' && Object.hasOwn(TABLES, t)

export const MAX_KEY_LENGTH = 1000

const statements = new WeakMap<Database.Database, Map<string, Database.Statement>>()

/** Prepared once per database: a sync runs the same few statements thousands of times. */
export function stmt(db: Database.Database, sql: string): Database.Statement {
  let cache = statements.get(db)
  if (!cache) statements.set(db, (cache = new Map()))
  let s = cache.get(sql)
  if (!s) cache.set(sql, (s = db.prepare(sql)))
  return s
}

/** The key for these parts, built the same way the triggers build it (SQLite's json_array). */
export function encodeKey(db: Database.Database, parts: readonly string[]): string {
  return stmt(db, `SELECT json_array(${parts.map(() => '?').join(', ')})`).pluck().get(...parts) as string
}

/**
 * Key parts from a server key, or null when the key is malformed. A key must
 * be byte-for-byte what this PC's triggers would write for the same row, so
 * the server can never hold two spellings of one row.
 */
export function decodeKey(db: Database.Database, tbl: SyncTable, key: unknown): string[] | null {
  if (typeof key !== 'string' || key.length > MAX_KEY_LENGTH) return null
  let parts: unknown
  try { parts = JSON.parse(key) } catch { return null }
  const spec = TABLES[tbl]
  if (!Array.isArray(parts) || parts.length !== spec.key.length) return null
  for (const [i, part] of parts.entries()) {
    if (checkValue(spec.columns[spec.key[i]], part) !== part || part === null) return null
  }
  return encodeKey(db, parts as string[]) === key ? (parts as string[]) : null
}

/** The value to store, or undefined when it doesn't fit the column. */
function checkValue(col: Column, v: unknown): Value | undefined {
  if (v === null) return col.nullable ? null : undefined
  switch (col.type) {
    case 'text': {
      if (typeof v !== 'string' || v.length > (col.max ?? 500)) return undefined
      if (col.normalize) return col.normalize(v)
      return !col.oneOf || col.oneOf.includes(v) ? v : undefined
    }
    case 'int':
      return typeof v === 'number' && Number.isSafeInteger(v) ? v : undefined
    case 'real':
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }
}

/**
 * A pulled row's columns, validated, with the key columns taken from the key
 * itself (so data can't smuggle in a different row). Columns the sender
 * didn't know about are simply absent. Null when any value is invalid.
 */
export function cleanData(tbl: SyncTable, parts: readonly string[], data: unknown): Record<string, Value> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const spec = TABLES[tbl]
  const out: Record<string, Value> = {}
  for (const [name, col] of Object.entries(spec.columns)) {
    if (!Object.hasOwn(data, name)) continue
    const v = checkValue(col, (data as Record<string, unknown>)[name])
    if (v === undefined) return null
    out[name] = v
  }
  spec.key.forEach((k, i) => { out[k] = parts[i] })
  return out
}

// ── Reading local rows ───────────────────────────────────────────────────────

const where = (cols: readonly string[]) => cols.map((c) => `${c} = ?`).join(' AND ')

/** The row's synced columns, or null when the row is gone. */
export function readRow(db: Database.Database, tbl: SyncTable, parts: readonly string[]): Record<string, Value> | null {
  if (tbl === 'item_tags') {
    return (stmt(db, `
      SELECT it.entity_type, it.entity_id, t.name AS tag
      FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.entity_type = ? AND it.entity_id = ? AND t.name = ?
    `).get(...parts) ?? null) as Record<string, Value> | null
  }
  const spec = TABLES[tbl]
  return (stmt(db, `SELECT ${Object.keys(spec.columns).join(', ')} FROM ${tbl} WHERE ${where(spec.key)}`)
    .get(...parts) ?? null) as Record<string, Value> | null
}

/** Live (table, key, ts) for every existing row, for the first sync. */
export function backfillSql(tbl: SyncTable): string {
  const spec = TABLES[tbl]
  if (tbl === 'item_tags') {
    return `SELECT 'item_tags' AS tbl, json_array(it.entity_type, it.entity_id, t.name) AS key, 0 AS ts
            FROM item_tags it JOIN tags t ON t.id = it.tag_id`
  }
  return `SELECT '${tbl}' AS tbl, json_array(${spec.key.join(', ')}) AS key, ${spec.backfillTs} AS ts FROM ${tbl}`
}

// ── Writing pulled rows ──────────────────────────────────────────────────────
// Called with change tracking switched off; the caller records sync metadata.

export function upsertRow(db: Database.Database, tbl: SyncTable, data: Record<string, Value>): void {
  if (tbl === 'item_tags') {
    stmt(db, 'INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING').run(data.tag)
    stmt(db, `
      INSERT INTO item_tags (entity_type, entity_id, tag_id)
      SELECT ?, ?, id FROM tags WHERE name = ?
      ON CONFLICT DO NOTHING
    `).run(data.entity_type, data.entity_id, data.tag)
    return
  }
  const spec = TABLES[tbl]
  const cols = Object.keys(spec.columns).filter((c) => c in data)
  const rest = cols.filter((c) => !spec.key.includes(c))
  stmt(db, `
    INSERT INTO ${tbl} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
    ON CONFLICT(${spec.key.join(', ')}) DO ${rest.length ? `UPDATE SET ${rest.map((c) => `${c} = excluded.${c}`).join(', ')}` : 'NOTHING'}
  `).run(...cols.map((c) => data[c]))
}

export function deleteRow(db: Database.Database, tbl: SyncTable, parts: readonly string[]): void {
  if (tbl === 'item_tags') {
    stmt(db, 'DELETE FROM item_tags WHERE entity_type = ? AND entity_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)')
      .run(...parts)
    return
  }
  stmt(db, `DELETE FROM ${tbl} WHERE ${where(TABLES[tbl].key)}`).run(...parts)
}

/** (entity_type, entity_id) of every item carrying this tag. */
export function linksOfTag(db: Database.Database, name: string): { entity_type: string; entity_id: string }[] {
  return stmt(db, `
    SELECT it.entity_type, it.entity_id FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE t.name = ?
  `).all(name) as { entity_type: string; entity_id: string }[]
}

export const tagExists = (db: Database.Database, name: string): boolean =>
  stmt(db, 'SELECT 1 FROM tags WHERE name = ?').get(name) !== undefined
