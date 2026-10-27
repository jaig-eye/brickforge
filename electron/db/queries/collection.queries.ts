/**
 * Collection queries — sets, minifigures, and the tags on them.
 *
 * Two kinds of data live on every row and are written by different paths:
 *  - CATALOG fields (name, year, theme, pieces, images, links) come from
 *    Rebrickable/BrickLink and may be refreshed at any time;
 *  - YOUR fields (owned/wanted, condition, price paid, quantity, notes, box…)
 *    are only ever changed by you.
 * Re-adding or re-importing an item refreshes catalog fields and never resets
 * yours — that split is the whole point of addSet/addFig vs updateSet/updateFig.
 *
 * BrickLink ids are the keys: a set's number is the same in both catalogs,
 * and a minifigure's fig_number is its BrickLink id once that's known (its
 * Rebrickable fig-… number is kept in rebrickable_id). See rekeyFig.
 */
import { getDb } from '../index'
import { normalizeSetCondition, normalizeFigCondition } from '../../../src/lib/conditions'
import { bricklinkCatalogUrl, isRebrickableFigNumber } from '../../../src/lib/lego-ids'
import type {
  LegoSet, Minifigure, CollectionSet, CollectionFig, CollectionQuery, SetPatch, FigPatch,
  AddOptions, AddResult, EntityKind, Tag, OwnershipIndex,
} from '../../../src/lib/types'

const TAG_SEP = '\u001f'
const today = () => new Date().toISOString().slice(0, 10)

// ── Listing ───────────────────────────────────────────────────────────────────

const SET_SORT: Record<string, string> = {
  added: 's.created_at', name: 's.name COLLATE NOCASE', year: 's.year', number: 's.set_number',
  value: '(lp.avg_price * s.quantity)', paid: 's.acquired_price', gain: '(lp.avg_price - s.acquired_price)',
  theme: 's.theme COLLATE NOCASE', pieces: 's.piece_count',
}
const FIG_SORT: Record<string, string> = {
  added: 'm.created_at', name: 'm.name COLLATE NOCASE', year: 'm.year', number: 'm.fig_number',
  value: '(lp.avg_price * m.quantity)', paid: 'm.acquired_price', gain: '(lp.avg_price - m.acquired_price)',
  theme: 'm.theme COLLATE NOCASE', pieces: 'm.name COLLATE NOCASE',
}

function orderBy(cols: Record<string, string>, sort = 'added', dir: 'asc' | 'desc' = 'desc'): string {
  // Own keys only: a sort of "constructor" or "toString" would find an
  // Object.prototype function and throw instead of falling back
  const col = Object.hasOwn(cols, sort) ? cols[sort] : cols.added
  // NULLs sink to the bottom in both directions; ties fall back to name
  return `ORDER BY (${col.replace(/ COLLATE NOCASE$/, '')} IS NULL), ${col} ${dir === 'asc' ? 'ASC' : 'DESC'}, 2`
}

function scopeClause(alias: string, scope: CollectionQuery['scope']): string {
  if (scope === 'wanted') return `${alias}.is_wanted = 1 AND ${alias}.is_owned = 0`
  if (scope === 'all') return '1 = 1'
  return `${alias}.is_owned = 1`
}

function splitTags<T extends { tag_list?: string | null }>(row: T): Omit<T, 'tag_list'> & { tags: string[] } {
  const { tag_list, ...rest } = row
  return { ...rest, tags: tag_list ? tag_list.split(TAG_SEP) : [] }
}

export function listSets(q: CollectionQuery = {}): CollectionSet[] {
  const where = [scopeClause('s', q.scope)]
  const params: unknown[] = []
  if (q.search?.trim()) {
    where.push('(s.name LIKE ? OR s.set_number LIKE ? OR s.theme LIKE ?)')
    const like = `%${q.search.trim()}%`
    params.push(like, like, like)
  }
  if (q.theme) { where.push('s.theme = ?'); params.push(q.theme) }
  if (q.condition) { where.push('s.condition = ?'); params.push(q.condition) }
  if (q.tag) {
    where.push(`EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.entity_type = 'set' AND it.entity_id = s.set_number AND t.name = ?)`)
    params.push(q.tag)
  }
  const rows = getDb().prepare(`
    SELECT s.*, lp.avg_price AS market_price, lp.source AS market_source, lp.recorded_at AS market_at,
      (SELECT group_concat(t.name, char(31)) FROM item_tags it JOIN tags t ON t.id = it.tag_id
        WHERE it.entity_type = 'set' AND it.entity_id = s.set_number) AS tag_list
    FROM sets s
    LEFT JOIN latest_prices lp ON lp.entity_type = 'set' AND lp.entity_id = s.set_number
      AND lp.condition = CASE WHEN s.condition = 'sealed' THEN 'new' ELSE 'used' END
    WHERE ${where.join(' AND ')}
    ${orderBy(SET_SORT, q.sort, q.dir)}
  `).all(...params) as (LegoSet & { market_price: number | null; market_source: 'sold' | 'stock' | null; market_at: string | null; tag_list: string | null })[]
  return rows.map(splitTags)
}

export function listFigs(q: CollectionQuery = {}): CollectionFig[] {
  const where = [scopeClause('m', q.scope)]
  const params: unknown[] = []
  if (q.search?.trim()) {
    where.push('(m.name LIKE ? OR m.fig_number LIKE ? OR m.bricklink_id LIKE ? OR m.rebrickable_id LIKE ? OR m.character LIKE ? OR m.theme LIKE ?)')
    const like = `%${q.search.trim()}%`
    params.push(like, like, like, like, like, like)
  }
  if (q.theme) { where.push('m.theme = ?'); params.push(q.theme) }
  if (q.condition) { where.push('m.condition = ?'); params.push(q.condition) }
  if (q.tag) {
    where.push(`EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.entity_type = 'minifig' AND it.entity_id = m.fig_number AND t.name = ?)`)
    params.push(q.tag)
  }
  const rows = getDb().prepare(`
    SELECT m.*, lp.avg_price AS market_price, lp.source AS market_source, lp.recorded_at AS market_at,
      (SELECT group_concat(t.name, char(31)) FROM item_tags it JOIN tags t ON t.id = it.tag_id
        WHERE it.entity_type = 'minifig' AND it.entity_id = m.fig_number) AS tag_list
    FROM minifigures m
    LEFT JOIN latest_prices lp ON lp.entity_type = 'minifig' AND lp.entity_id = m.fig_number
      AND lp.condition = CASE WHEN m.condition = 'new' THEN 'new' ELSE 'used' END
    WHERE ${where.join(' AND ')}
    ${orderBy(FIG_SORT, q.sort, q.dir)}
  `).all(...params) as (Minifigure & { market_price: number | null; market_source: 'sold' | 'stock' | null; market_at: string | null; tag_list: string | null })[]
  return rows.map(splitTags)
}

export function collectionThemes(): { sets: string[]; figs: string[] } {
  const db = getDb()
  const pick = (sql: string) => (db.prepare(sql).all() as { theme: string }[]).map((r) => r.theme)
  return {
    sets: pick('SELECT DISTINCT theme FROM sets WHERE theme IS NOT NULL ORDER BY theme COLLATE NOCASE'),
    figs: pick('SELECT DISTINCT theme FROM minifigures WHERE theme IS NOT NULL ORDER BY theme COLLATE NOCASE'),
  }
}

/** Set and fig numbers you own or want — for "Owned" badges in Catalog and Scan. */
export function ownershipIndex(): OwnershipIndex {
  const db = getDb()
  const sets = db.prepare('SELECT set_number AS n, is_owned, is_wanted FROM sets').all() as { n: string; is_owned: number; is_wanted: number }[]
  const figs = db.prepare('SELECT fig_number AS n, bricklink_id AS bl, rebrickable_id AS rb, is_owned, is_wanted FROM minifigures').all() as { n: string; bl: string | null; rb: string | null; is_owned: number; is_wanted: number }[]
  const owned: string[] = []
  const wanted: string[] = []
  for (const s of sets) {
    if (s.is_owned) owned.push(s.n)
    else if (s.is_wanted) wanted.push(s.n)
  }
  // Catalog and Scan show figs under either catalog's number (Rebrickable
  // fig-XXXX, BrickLink sw0380); both must match, or an owned fig looks new.
  for (const f of figs) {
    const ids = [...new Set([f.n, f.bl, f.rb].filter((v): v is string => !!v))]
    if (f.is_owned) owned.push(...ids)
    else if (f.is_wanted) wanted.push(...ids)
  }
  return { owned, wanted }
}

// ── Sets ──────────────────────────────────────────────────────────────────────

export interface SetCatalogFields {
  set_number: string
  name: string
  year: number | null
  theme: string | null
  piece_count: number | null
  image_url: string | null
  rebrickable_url: string | null
}

export function getSet(id: number): LegoSet | null {
  return (getDb().prepare('SELECT * FROM sets WHERE id = ?').get(id) ?? null) as LegoSet | null
}

export function getSetByNumber(setNumber: string): LegoSet | null {
  return (getDb().prepare('SELECT * FROM sets WHERE set_number = ?').get(setNumber) ?? null) as LegoSet | null
}

/** Insert a catalog-only row, or refresh catalog fields on an existing one. */
export function upsertSetCatalog(c: SetCatalogFields): LegoSet {
  getDb().prepare(`
    INSERT INTO sets (set_number, name, year, theme, piece_count, image_url, rebrickable_url, bricklink_url, is_owned, is_wanted, condition)
    VALUES (@set_number, @name, @year, @theme, @piece_count, @image_url, @rebrickable_url, @bricklink_url, 0, 0, 'sealed')
    ON CONFLICT(set_number) DO UPDATE SET
      name = excluded.name,
      year = COALESCE(excluded.year, year),
      theme = COALESCE(excluded.theme, theme),
      piece_count = COALESCE(excluded.piece_count, piece_count),
      image_url = COALESCE(excluded.image_url, image_url),
      rebrickable_url = COALESCE(excluded.rebrickable_url, rebrickable_url),
      bricklink_url = excluded.bricklink_url
  `).run({ ...c, bricklink_url: bricklinkCatalogUrl('S', c.set_number) })
  return getSetByNumber(c.set_number) as LegoSet
}

/**
 * Put a set in the collection. Already owned → one more copy. On the wishlist
 * and now owned → moved off the wishlist. Your notes, box, and other fields
 * on an existing row are never reset.
 */
export function addSet(c: SetCatalogFields, opts: AddOptions): AddResult<LegoSet> {
  const db = getDb()
  return db.transaction((): AddResult<LegoSet> => {
    const before = getSetByNumber(c.set_number)
    const row = upsertSetCatalog(c)
    const qty = Math.max(1, Math.floor(opts.quantity ?? 1))
    if (opts.as === 'wanted') {
      if (before && (before.is_owned || before.is_wanted)) return { item: row, outcome: 'exists' }
      db.prepare(`UPDATE sets SET is_wanted = 1, notes = COALESCE(notes, ?), updated_at = datetime('now') WHERE id = ?`)
        .run(opts.notes ?? null, row.id)
      return { item: getSet(row.id)!, outcome: 'added' }
    }
    const condition = normalizeSetCondition(opts.condition ?? 'sealed')
    if (before?.is_owned) {
      db.prepare(`UPDATE sets SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`).run(qty, row.id)
      return { item: getSet(row.id)!, outcome: 'copy' }
    }
    db.prepare(`
      UPDATE sets SET is_owned = 1, is_wanted = 0, condition = ?, quantity = ?,
        acquired_price = COALESCE(?, acquired_price), acquired_date = COALESCE(acquired_date, ?),
        notes = COALESCE(notes, ?), updated_at = datetime('now')
      WHERE id = ?
    `).run(condition, qty, opts.acquired_price ?? null, today(), opts.notes ?? null, row.id)
    return { item: getSet(row.id)!, outcome: before?.is_wanted ? 'moved' : 'added' }
  })()
}

const SET_PATCH_COLS = new Set<keyof SetPatch>([
  'name', 'notes', 'is_owned', 'is_wanted', 'condition', 'acquired_date', 'acquired_price',
  'quantity', 'has_box', 'has_instructions', 'missing_parts',
])

export function updateSet(id: number, patch: SetPatch): LegoSet {
  const entries = Object.entries(patch ?? {}).filter(([k, v]) => SET_PATCH_COLS.has(k as keyof SetPatch) && v !== undefined)
  if (entries.length) {
    const values = entries.map(([k, v]) => {
      if (k === 'condition') return normalizeSetCondition(String(v))
      if (k === 'quantity') return Math.max(1, Math.floor(Number(v) || 1))
      return v
    })
    getDb().prepare(`UPDATE sets SET ${entries.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
      .run(...values, id)
  }
  const row = getSet(id)
  if (!row) throw new Error('That set is no longer in your collection.')
  return row
}

/** Set a theme without touching updated_at (background backfill). */
export function setSetTheme(setNumber: string, theme: string): void {
  getDb().prepare('UPDATE sets SET theme = ? WHERE set_number = ?').run(theme, setNumber)
}

export function listSetsMissingTheme(): { set_number: string }[] {
  return getDb().prepare('SELECT set_number FROM sets WHERE theme IS NULL').all() as { set_number: string }[]
}

// ── Minifigures ───────────────────────────────────────────────────────────────

export interface FigCatalogFields {
  fig_number: string
  name: string
  image_url: string | null
  bricklink_id?: string | null
  character?: string | null
  theme?: string | null
  year?: number | null
}

export function getFig(id: number): Minifigure | null {
  return (getDb().prepare('SELECT * FROM minifigures WHERE id = ?').get(id) ?? null) as Minifigure | null
}

export function getFigByNumber(figNumber: string): Minifigure | null {
  return (getDb().prepare('SELECT * FROM minifigures WHERE fig_number = ?').get(figNumber) ?? null) as Minifigure | null
}

/**
 * The existing row for a fig under EITHER catalog's number: its BrickLink id
 * (its key), or the Rebrickable number it was added or matched under.
 */
export function findFig(figNumber: string, bricklinkId?: string | null): Minifigure | null {
  const ids = [...new Set([figNumber, bricklinkId].filter((v): v is string => !!v))]
  const marks = ids.map(() => '?').join(', ')
  return (getDb().prepare(
    `SELECT * FROM minifigures WHERE fig_number IN (${marks}) OR bricklink_id IN (${marks}) OR rebrickable_id IN (${marks})
     ORDER BY is_owned DESC, id LIMIT 1`,
  ).get(...ids, ...ids, ...ids) ?? null) as Minifigure | null
}

/** A fig's current row by any of its numbers: after a re-key, its old Rebrickable number still finds it. */
function figByAnyNumber(figNumber: string): Minifigure | null {
  return (getDb().prepare('SELECT * FROM minifigures WHERE fig_number = ? OR rebrickable_id = ? ORDER BY fig_number = ? DESC LIMIT 1')
    .get(figNumber, figNumber, figNumber) ?? null) as Minifigure | null
}

// Rows elsewhere that refer to a minifigure by its number
const FIG_REFS = ['price_history', 'price_alerts', 'item_tags'] as const

/**
 * Make a minifigure's BrickLink id its number. Its prices, alerts, and tags
 * move with it, and sync records each move as the old key's removal and the
 * new key's arrival. If another row already has that BrickLink id (the same
 * figure reached by both numbers, or a copy pulled from another computer),
 * the two become one: the BrickLink row keeps its fields and fills its gaps
 * from the other, and quantity is the larger of the two, never their sum, so
 * repeating the move never counts a figure twice.
 */
export function rekeyFig(from: string, blId: string): Minifigure | null {
  const db = getDb()
  const to = blId.trim()
  if (!to || isRebrickableFigNumber(to)) return figByAnyNumber(from)
  return db.transaction((): Minifigure | null => {
    const row = figByAnyNumber(from)
    if (!row) return null
    const old = row.fig_number
    const rb = row.rebrickable_id ?? (isRebrickableFigNumber(old) ? old : null)
    if (old === to) {
      if (row.bricklink_id !== to || row.rebrickable_id !== rb) {
        db.prepare('UPDATE minifigures SET bricklink_id = ?, rebrickable_id = ? WHERE id = ?').run(to, rb, row.id)
      }
      return getFig(row.id)
    }
    const target = getFigByNumber(to)
    if (target) {
      db.prepare(`
        UPDATE minifigures SET
          rebrickable_id = COALESCE(rebrickable_id, ?), bricklink_id = ?,
          character = COALESCE(character, ?), theme = COALESCE(theme, ?), year = COALESCE(year, ?),
          image_url = COALESCE(image_url, ?), notes = COALESCE(notes, ?),
          acquired_price = COALESCE(acquired_price, ?), acquired_date = COALESCE(acquired_date, ?),
          quantity = MAX(quantity, ?),
          is_owned = MAX(is_owned, ?),
          is_wanted = CASE WHEN MAX(is_owned, ?) = 1 THEN 0 ELSE MAX(is_wanted, ?) END,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(rb, to, row.character, row.theme, row.year, row.image_url, row.notes, row.acquired_price, row.acquired_date,
        row.quantity, row.is_owned, row.is_owned, row.is_wanted, target.id)
      db.prepare('DELETE FROM minifigures WHERE id = ?').run(row.id)
    } else {
      db.prepare(`UPDATE minifigures SET fig_number = ?, bricklink_id = ?, rebrickable_id = ?, bricklink_url = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(to, to, rb, bricklinkCatalogUrl('M', to), row.id)
    }
    if (rb) rememberFigId(rb, to)
    // Where both numbers have a row (a price on the same day), the BrickLink one stays
    for (const tbl of FIG_REFS) {
      db.prepare(`UPDATE OR IGNORE ${tbl} SET entity_id = ? WHERE entity_type = 'minifig' AND entity_id = ?`).run(to, old)
      db.prepare(`DELETE FROM ${tbl} WHERE entity_type = 'minifig' AND entity_id = ?`).run(old)
    }
    return getFigByNumber(to)
  })()
}

// ── What the bridge has learned (fig_id_map) ─────────────────────────────────

/** Remember a Rebrickable number's BrickLink id, or that none was found (null). */
export function rememberFigId(rebrickableId: string, bricklinkId: string | null): void {
  if (!isRebrickableFigNumber(rebrickableId)) return
  getDb().prepare(`
    INSERT INTO fig_id_map (rebrickable_id, bricklink_id, checked_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(rebrickable_id) DO UPDATE SET
      bricklink_id = COALESCE(excluded.bricklink_id, fig_id_map.bricklink_id), checked_at = excluded.checked_at
  `).run(rebrickableId, bricklinkId)
}

/** The BrickLink id known for a Rebrickable number, from the collection or the map. */
export function rememberedFigId(rebrickableId: string): string | null {
  return rememberedFigIds([rebrickableId])[rebrickableId] ?? null
}

/**
 * What's known for these Rebrickable numbers: a BrickLink id, or null when
 * the bridge looked in the last week and found none. Numbers it hasn't
 * looked up (or looked up long ago) are left out.
 */
export function rememberedFigIds(rebrickableIds: string[]): Record<string, string | null> {
  const ids = [...new Set(rebrickableIds.filter(isRebrickableFigNumber))]
  const out: Record<string, string | null> = {}
  if (!ids.length) return out
  const marks = ids.map(() => '?').join(', ')
  const db = getDb()
  const mapped = db.prepare(`
    SELECT rebrickable_id AS rb, bricklink_id AS bl FROM fig_id_map
    WHERE rebrickable_id IN (${marks}) AND (bricklink_id IS NOT NULL OR checked_at > datetime('now', '-7 days'))
  `).all(...ids) as { rb: string; bl: string | null }[]
  for (const r of mapped) out[r.rb] = r.bl
  const owned = db.prepare(`
    SELECT rebrickable_id AS rb, fig_number AS bl FROM minifigures WHERE rebrickable_id IN (${marks}) AND fig_number NOT LIKE 'fig-%'
  `).all(...ids) as { rb: string; bl: string }[]
  for (const r of owned) out[r.rb] = r.bl
  return out
}

/**
 * Move every minifigure whose BrickLink id is known onto it. Runs after the
 * migrations and after each sync, so rows added under Rebrickable numbers
 * (by an older version, or on another computer) settle on BrickLink ids.
 */
export function rekeyFigsToBricklink(): number {
  const rows = getDb().prepare(
    "SELECT fig_number, bricklink_id FROM minifigures WHERE bricklink_id IS NOT NULL AND bricklink_id <> '' AND bricklink_id <> fig_number",
  ).all() as { fig_number: string; bricklink_id: string }[]
  let moved = 0
  for (const r of rows) if (rekeyFig(r.fig_number, r.bricklink_id)) moved++
  return moved
}

function figBricklinkId(c: FigCatalogFields): string | null {
  return c.bricklink_id ?? (isRebrickableFigNumber(c.fig_number) ? null : c.fig_number)
}

export function upsertFigCatalog(c: FigCatalogFields): Minifigure {
  const blId = figBricklinkId(c)
  const rbId = isRebrickableFigNumber(c.fig_number) ? c.fig_number : null
  const existing = findFig(c.fig_number, blId)
  const db = getDb()
  if (existing) {
    db.prepare(`
      UPDATE minifigures SET
        name = CASE WHEN name = fig_number OR name = '' THEN ? ELSE name END,
        image_url = COALESCE(image_url, ?),
        bricklink_id = COALESCE(bricklink_id, ?),
        rebrickable_id = COALESCE(rebrickable_id, ?),
        bricklink_url = ?,
        character = COALESCE(character, ?), theme = COALESCE(theme, ?), year = COALESCE(year, ?)
      WHERE id = ?
    `).run(c.name, c.image_url, blId, rbId, bricklinkCatalogUrl('M', blId ?? existing.bricklink_id ?? existing.fig_number),
      c.character ?? null, c.theme ?? null, c.year ?? null, existing.id)
    const row = getFig(existing.id)!
    return row.bricklink_id && row.bricklink_id !== row.fig_number ? rekeyFig(row.fig_number, row.bricklink_id)! : row
  }
  // A known BrickLink id is the key; otherwise the Rebrickable number holds it until one is found
  const key = blId ?? c.fig_number
  db.prepare(`
    INSERT INTO minifigures (fig_number, name, character, theme, year, image_url, bricklink_url, bricklink_id, rebrickable_id, is_owned, is_wanted, quantity, condition)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, 'used')
  `).run(key, c.name, c.character ?? null, c.theme ?? null, c.year ?? null, c.image_url,
    bricklinkCatalogUrl('M', key), blId, rbId)
  return getFigByNumber(key)!
}

export function addFig(c: FigCatalogFields, opts: AddOptions): AddResult<Minifigure> {
  const db = getDb()
  return db.transaction((): AddResult<Minifigure> => {
    const before = findFig(c.fig_number, figBricklinkId(c))
    const row = upsertFigCatalog(c)
    const qty = Math.max(1, Math.floor(opts.quantity ?? 1))
    if (opts.as === 'wanted') {
      if (before && (before.is_owned || before.is_wanted)) return { item: row, outcome: 'exists' }
      db.prepare(`UPDATE minifigures SET is_wanted = 1, updated_at = datetime('now') WHERE id = ?`).run(row.id)
      return { item: getFig(row.id)!, outcome: 'added' }
    }
    if (before?.is_owned) {
      db.prepare(`UPDATE minifigures SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`).run(qty, row.id)
      return { item: getFig(row.id)!, outcome: 'copy' }
    }
    db.prepare(`
      UPDATE minifigures SET is_owned = 1, is_wanted = 0, condition = ?, quantity = ?,
        acquired_price = COALESCE(?, acquired_price), acquired_date = COALESCE(acquired_date, ?),
        notes = COALESCE(notes, ?), updated_at = datetime('now')
      WHERE id = ?
    `).run(normalizeFigCondition(opts.condition ?? 'used'), qty, opts.acquired_price ?? null, today(), opts.notes ?? null, row.id)
    return { item: getFig(row.id)!, outcome: before?.is_wanted ? 'moved' : 'added' }
  })()
}

const FIG_PATCH_COLS = new Set<keyof FigPatch>([
  'name', 'character', 'notes', 'is_owned', 'is_wanted', 'condition', 'acquired_date',
  'acquired_price', 'quantity', 'bricklink_id',
])

export function updateFig(id: number, patch: FigPatch): Minifigure {
  const entries = Object.entries(patch ?? {}).filter(([k, v]) => FIG_PATCH_COLS.has(k as keyof FigPatch) && v !== undefined)
  if (entries.length) {
    const values = entries.map(([k, v]) => {
      if (k === 'condition') return normalizeFigCondition(String(v))
      if (k === 'quantity') return Math.max(1, Math.floor(Number(v) || 1))
      if (k === 'bricklink_id') return typeof v === 'string' && v.trim() ? v.trim() : null
      return v
    })
    const cols = entries.map(([k]) => `${k} = ?`)
    const blIdx = entries.findIndex(([k]) => k === 'bricklink_id')
    const fig = getFig(id)
    // A BrickLink-keyed fig keeps its id: a new one moves it (below), clearing it does nothing
    if (blIdx !== -1 && values[blIdx] == null && fig && !isRebrickableFigNumber(fig.fig_number)) {
      cols.splice(blIdx, 1)
      values.splice(blIdx, 1)
    } else if (blIdx !== -1) {
      cols.push('bricklink_url = ?')
      values.push(bricklinkCatalogUrl('M', (values[blIdx] as string | null) ?? fig?.fig_number ?? ''))
    }
    if (cols.length) getDb().prepare(`UPDATE minifigures SET ${cols.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values, id)
  }
  let row = getFig(id)
  if (!row) throw new Error('That minifigure is no longer in your collection.')
  if (row.bricklink_id && row.bricklink_id !== row.fig_number) row = rekeyFig(row.fig_number, row.bricklink_id) ?? row
  return row
}

/**
 * Background enrichment: fill gaps without touching updated_at. figNumber may
 * be the fig's Rebrickable number even after it moved to its BrickLink id;
 * a newly found BrickLink id moves it there.
 */
export function setFigDetails(figNumber: string, patch: { name?: string | null; image_url?: string | null; theme?: string | null; year?: number | null; bricklink_id?: string | null }): void {
  const row = figByAnyNumber(figNumber)
  if (!row) return
  getDb().prepare(`
    UPDATE minifigures SET
      name = CASE WHEN ? IS NOT NULL AND (name = fig_number OR name = '') THEN ? ELSE name END,
      image_url = COALESCE(image_url, ?),
      theme = COALESCE(theme, ?),
      year = COALESCE(year, ?),
      bricklink_id = COALESCE(bricklink_id, ?),
      bricklink_url = CASE WHEN ? IS NOT NULL AND bricklink_id IS NULL THEN ? ELSE bricklink_url END
    WHERE id = ?
  `).run(patch.name ?? null, patch.name ?? null, patch.image_url ?? null, patch.theme ?? null, patch.year ?? null,
    patch.bricklink_id ?? null, patch.bricklink_id ?? null,
    patch.bricklink_id ? bricklinkCatalogUrl('M', patch.bricklink_id) : null, row.id)
  const after = getFig(row.id)
  if (after?.bricklink_id && after.bricklink_id !== after.fig_number) rekeyFig(after.fig_number, after.bricklink_id)
}

export function listFigsMissingBricklinkId(): { fig_number: string }[] {
  return getDb().prepare(
    "SELECT fig_number FROM minifigures WHERE (bricklink_id IS NULL OR bricklink_id = '') AND fig_number LIKE 'fig-%'",
  ).all() as { fig_number: string }[]
}

/**
 * Figs missing theme or year that Rebrickable can fill in: those with a
 * Rebrickable number. fig_number here IS that number (setFigDetails finds the
 * row by either).
 */
export function listFigsMissingDetails(): { fig_number: string }[] {
  return getDb().prepare(
    "SELECT COALESCE(rebrickable_id, fig_number) AS fig_number FROM minifigures WHERE (theme IS NULL OR year IS NULL) AND COALESCE(rebrickable_id, fig_number) LIKE 'fig-%'",
  ).all() as { fig_number: string }[]
}

/** BrickLink-keyed figs that only have their number as a name (imports). */
export function listFigsMissingName(): { fig_number: string }[] {
  return getDb().prepare(
    "SELECT fig_number FROM minifigures WHERE (name = fig_number OR name = '') AND fig_number NOT LIKE 'fig-%'",
  ).all() as { fig_number: string }[]
}

// ── Delete / bulk / undo ──────────────────────────────────────────────────────

export type DeletedRow = (LegoSet | Minifigure) & { tags: string[] }

const table = (kind: EntityKind) => (kind === 'set' ? 'sets' : 'minifigures')
const keyCol = (kind: EntityKind) => (kind === 'set' ? 'set_number' : 'fig_number')

/** Delete rows atomically; returns them (with their tags) so the UI can undo. */
export function deleteItems(kind: EntityKind, ids: number[]): DeletedRow[] {
  const db = getDb()
  return db.transaction(() => {
    const sel = db.prepare(`SELECT * FROM ${table(kind)} WHERE id = ?`)
    const tagsOf = db.prepare('SELECT t.name FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.entity_type = ? AND it.entity_id = ?')
    const delTags = db.prepare('DELETE FROM item_tags WHERE entity_type = ? AND entity_id = ?')
    const del = db.prepare(`DELETE FROM ${table(kind)} WHERE id = ?`)
    const out: DeletedRow[] = []
    for (const id of ids) {
      const row = sel.get(id) as LegoSet | Minifigure | undefined
      if (!row) continue
      const key = (row as unknown as Record<string, string>)[keyCol(kind)]
      const tags = (tagsOf.all(kind, key) as { name: string }[]).map((t) => t.name)
      delTags.run(kind, key)
      del.run(id)
      out.push({ ...row, tags })
    }
    return out
  })()
}

export interface BulkPatch {
  condition?: string
  is_owned?: 0 | 1
  is_wanted?: 0 | 1
}

export function bulkUpdate(kind: EntityKind, ids: number[], patch: BulkPatch): number {
  const entries = Object.entries(patch ?? {}).filter(([k, v]) => ['condition', 'is_owned', 'is_wanted'].includes(k) && v !== undefined)
  if (!entries.length || !ids.length) return 0
  const values = entries.map(([k, v]) => (k === 'condition'
    ? (kind === 'set' ? normalizeSetCondition(String(v)) : normalizeFigCondition(String(v)))
    : (v ? 1 : 0)))
  const db = getDb()
  return db.transaction(() => {
    const stmt = db.prepare(`UPDATE ${table(kind)} SET ${entries.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    let n = 0
    for (const id of ids) n += stmt.run(...values, id).changes
    return n
  })()
}

// Row objects come back across IPC for undo, so only whitelisted columns reach SQL
const SET_RESTORE_COLS = [
  'set_number', 'name', 'year', 'theme', 'piece_count', 'retail_price_usd', 'image_url', 'rebrickable_url',
  'bricklink_url', 'notes', 'is_owned', 'is_wanted', 'condition', 'acquired_date', 'acquired_price', 'quantity',
  'has_box', 'has_instructions', 'missing_parts', 'created_at', 'updated_at',
] as const
const FIG_RESTORE_COLS = [
  'fig_number', 'name', 'character', 'theme', 'year', 'image_url', 'bricklink_url', 'bricklink_id', 'rebrickable_id', 'notes',
  'is_owned', 'is_wanted', 'quantity', 'condition', 'acquired_price', 'acquired_date', 'created_at', 'updated_at',
] as const

/** Undo a delete: re-insert rows (skipping any that were re-added since) and their tags. */
export function restoreItems(kind: EntityKind, rows: DeletedRow[]): number {
  const db = getDb()
  const cols = kind === 'set' ? SET_RESTORE_COLS : FIG_RESTORE_COLS
  const key = keyCol(kind)
  return db.transaction(() => {
    let n = 0
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== 'object') continue
      const r = row as unknown as Record<string, unknown>
      const present = cols.filter((c) => r[c] !== undefined)
      if (!present.includes(key as never) || typeof r[key] !== 'string') continue
      n += db.prepare(`INSERT INTO ${table(kind)} (${present.join(', ')}) VALUES (${present.map(() => '?').join(', ')})
        ON CONFLICT(${key}) DO NOTHING`).run(...present.map((c) => r[c] as never)).changes
      if (Array.isArray(row.tags) && row.tags.length) tagItems(kind, [r[key] as string], row.tags)
    }
    return n
  })()
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export function listTags(): Tag[] {
  return getDb().prepare(`
    SELECT t.id, t.name, t.color, COUNT(it.tag_id) AS item_count
    FROM tags t LEFT JOIN item_tags it ON it.tag_id = t.id
    GROUP BY t.id ORDER BY t.name COLLATE NOCASE
  `).all() as Tag[]
}

/** A tag name: trimmed, short, and free of ";", which separates tags in a CSV export. */
const tagName = (name: string) => name.replace(/;/g, ',').trim().slice(0, 40)

function ensureTag(name: string): number {
  const db = getDb()
  const clean = tagName(name)
  if (!clean) throw new Error('A tag needs a name.')
  db.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING').run(clean)
  return (db.prepare('SELECT id FROM tags WHERE name = ?').get(clean) as { id: number }).id
}

/** Tag items by number (set_number / fig_number); creates missing tags. */
export function tagItems(kind: EntityKind, numbers: string[], tagNames: string[]): number {
  const db = getDb()
  return db.transaction(() => {
    const ins = db.prepare('INSERT OR IGNORE INTO item_tags (entity_type, entity_id, tag_id) VALUES (?, ?, ?)')
    let n = 0
    for (const tag of tagNames) {
      const tagId = ensureTag(tag)
      for (const num of numbers) n += ins.run(kind, num, tagId).changes
    }
    return n
  })()
}

export function untagItems(kind: EntityKind, numbers: string[], tagName: string): number {
  const db = getDb()
  const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName) as { id: number } | undefined
  if (!tag) return 0
  const del = db.prepare('DELETE FROM item_tags WHERE entity_type = ? AND entity_id = ? AND tag_id = ?')
  return db.transaction(() => numbers.reduce((n, num) => n + del.run(kind, num, tag.id).changes, 0))()
}

export function deleteTag(name: string): void {
  getDb().prepare('DELETE FROM tags WHERE name = ?').run(name)
}

export function renameTag(from: string, to: string): void {
  const clean = tagName(to)
  if (!clean) throw new Error('A tag needs a name.')
  getDb().prepare('UPDATE tags SET name = ? WHERE name = ?').run(clean, from)
}
