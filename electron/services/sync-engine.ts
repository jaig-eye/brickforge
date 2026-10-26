/**
 * The sync engine: moves rows between this PC's SQLite database and one
 * shared Postgres table, both ways, last write wins per row.
 *
 * Pure on purpose. Every function takes the local database, ONE remote
 * connection (a pg Client/PoolClient or PGlite: pushes run in a transaction,
 * so a pool won't do) and this PC's device id; settings, timers and the
 * connection pool live in sync.ts.
 *
 * The server keeps one row per (table, natural key) in brickforge_sync, as
 * JSON, so new app columns never need a server migration. Every write takes a
 * fresh seq, which makes "everything after seq N" a complete change feed.
 * Pushes hold an advisory lock while they write, so seqs become visible in
 * order and a reader can never step past a row that is still committing.
 */
import type Database from 'better-sqlite3'
import {
  TABLES, TABLE_ORDER, isSyncTable, decodeKey, encodeKey, cleanData, readRow, backfillSql,
  upsertRow, deleteRow, linksOfTag, tagExists, stmt, type SyncTable,
} from './sync-tables'

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export interface SyncResult {
  pushed: number
  pulled: number
  /** Server rows that failed validation and were skipped. */
  rejected: number
}

const LOCK_KEY = 1650881401 // "bfsy"
const PULL_BATCH = 500
const PUSH_BATCH = 200
const MAX_PUSH_CHARS = 1_000_000
const MAX_PUSH_ROUNDS = 1000

const REMOTE_SCHEMA = [
  'CREATE SEQUENCE IF NOT EXISTS brickforge_sync_seq',
  `CREATE TABLE IF NOT EXISTS brickforge_sync (
     tbl     text    NOT NULL,
     key     text    NOT NULL,
     data    jsonb,
     deleted boolean NOT NULL DEFAULT false,
     ts      bigint  NOT NULL,
     device  text    NOT NULL,
     seq     bigint  NOT NULL,
     PRIMARY KEY (tbl, key)
   )`,
  'CREATE INDEX IF NOT EXISTS brickforge_sync_seq_idx ON brickforge_sync (seq)',
  // Supabase publishes tables in "public" through its REST API; with RLS on
  // and no policies only the owner (the connection-string user) can read it.
  'ALTER TABLE brickforge_sync ENABLE ROW LEVEL SECURITY',
]

// Last write wins; equal timestamps go to the larger device id, so every PC
// and the server settle on the same row.
const UPSERT_SQL = `
  INSERT INTO brickforge_sync AS s (tbl, key, data, deleted, ts, device, seq)
  SELECT r.tbl, r.key, r.data, r.deleted, r.ts, $2, nextval('brickforge_sync_seq')
  FROM jsonb_to_recordset($1::jsonb) AS r(tbl text, key text, data jsonb, deleted boolean, ts bigint)
  ON CONFLICT (tbl, key) DO UPDATE SET
    data = excluded.data, deleted = excluded.deleted, ts = excluded.ts, device = excluded.device, seq = excluded.seq
  WHERE excluded.ts > s.ts OR (excluded.ts = s.ts AND excluded.device COLLATE "C" > s.device COLLATE "C")`

// ── Remote ───────────────────────────────────────────────────────────────────

async function inTransaction(remote: Queryable, fn: () => Promise<void>): Promise<void> {
  await remote.query('BEGIN')
  try {
    await fn()
    await remote.query('COMMIT')
  } catch (err) {
    await remote.query('ROLLBACK').catch(() => undefined)
    throw err
  }
}

/** Create the sync table on first use. Needs CREATE rights only that once. */
export async function ensureRemoteSchema(remote: Queryable): Promise<void> {
  const { rows } = await remote.query<{ ready: boolean }>(
    "SELECT to_regclass('brickforge_sync') IS NOT NULL AND to_regclass('brickforge_sync_seq') IS NOT NULL AS ready")
  if (rows[0]?.ready) return
  await inTransaction(remote, async () => {
    await remote.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]) // two PCs connecting at once
    for (const sql of REMOTE_SCHEMA) await remote.query(sql)
  })
}

// ── Local bookkeeping ────────────────────────────────────────────────────────

interface Meta { ts: number; deleted: number; dirty: number }

function getState(db: Database.Database, key: string): string | undefined {
  return stmt(db, 'SELECT value FROM _sync_state WHERE key = ?').pluck().get(key) as string | undefined
}

function setState(db: Database.Database, key: string, value: string): void {
  stmt(db, 'INSERT INTO _sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

function getMeta(db: Database.Database, tbl: SyncTable, key: string): Meta | undefined {
  return stmt(db, 'SELECT ts, deleted, dirty FROM _sync_meta WHERE tbl = ? AND key = ?').get(tbl, key) as Meta | undefined
}

function setMeta(db: Database.Database, tbl: SyncTable, key: string, ts: number, deleted: boolean, dirty: boolean): void {
  stmt(db, `
    INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(tbl, key) DO UPDATE SET ts = excluded.ts, deleted = excluded.deleted, dirty = excluded.dirty
  `).run(tbl, key, ts, deleted ? 1 : 0, dirty ? 1 : 0)
}

/**
 * Get ready for a sync from scratch (first connect, or a server that was
 * emptied): track rows that predate change tracking, queue everything for
 * upload, and read the server's feed from the start.
 */
export function prepareFullSync(db: Database.Database): void {
  db.transaction(() => {
    for (const tbl of TABLE_ORDER) {
      stmt(db, `
        INSERT INTO _sync_meta (tbl, key, ts, deleted, dirty)
        SELECT tbl, key, ts, 0, 1 FROM (${backfillSql(tbl)}) WHERE true
        ON CONFLICT(tbl, key) DO UPDATE SET deleted = 0
      `).run()
    }
    stmt(db, 'UPDATE _sync_meta SET dirty = 1 WHERE dirty = 0').run()
    setState(db, 'lastSeq', '0')
    stmt(db, "DELETE FROM _sync_state WHERE key = 'remoteTable'").run()
  })()
}

export function pendingCount(db: Database.Database): number {
  return stmt(db, 'SELECT COUNT(*) FROM _sync_meta WHERE dirty = 1').pluck().get() as number
}

/** Changes whenever local edits are waiting; cheap enough to poll. */
export function changeMarker(db: Database.Database): string {
  const r = stmt(db, 'SELECT COUNT(*) AS n, COALESCE(MAX(ts), 0) AS ts FROM _sync_meta WHERE dirty = 1').get() as { n: number; ts: number }
  return `${r.n}:${r.ts}`
}

// ── Pull ─────────────────────────────────────────────────────────────────────

interface RemoteRow {
  tbl: unknown
  key: unknown
  data: unknown
  deleted: unknown
  ts: unknown
  device: unknown
  seq: unknown
}

type Outcome = 'applied' | 'skipped' | 'rejected'

const rank = (tbl: unknown) => (isSyncTable(tbl) ? TABLE_ORDER.indexOf(tbl) : TABLE_ORDER.length)

/**
 * A tag deleted on another PC. Links to it made after that delete keep the
 * tag alive (it is pushed back as live); otherwise it goes, and the links its
 * FK cascade removes are recorded as deleted so PCs that only learned of a
 * link from here drop it too.
 */
function applyTagDelete(db: Database.Database, name: string, key: string, ts: number): Outcome {
  const links = linksOfTag(db, name).map((l) => {
    const linkKey = encodeKey(db, [l.entity_type, l.entity_id, name])
    return { linkKey, meta: getMeta(db, 'item_tags', linkKey) }
  })
  const newest = links.reduce((m, l) => (l.meta && !l.meta.deleted ? Math.max(m, l.meta.ts) : m), 0)
  if (newest > ts) {
    setMeta(db, 'tags', key, newest, false, true)
    return 'skipped'
  }
  deleteRow(db, 'tags', [name])
  for (const l of links) setMeta(db, 'item_tags', l.linkKey, Math.max(ts, (l.meta?.ts ?? -1) + 1), true, true)
  setMeta(db, 'tags', key, ts, true, false)
  return 'applied'
}

/**
 * A link arrived for a tag this PC doesn't have. When the tag was deleted
 * here after the link was made, the link loses (and is pushed back as
 * deleted); otherwise the tag is created, and a revived tag is pushed as live.
 */
function tagAllowsLink(db: Database.Database, linkKey: string, name: string, ts: number): boolean {
  if (tagExists(db, name)) return true
  const tagKey = encodeKey(db, [name])
  const tag = getMeta(db, 'tags', tagKey)
  if (tag?.deleted && tag.ts >= ts) {
    setMeta(db, 'item_tags', linkKey, Math.max(tag.ts, ts + 1), true, true)
    return false
  }
  if (tag?.deleted) setMeta(db, 'tags', tagKey, ts, false, true)
  return true
}

function applyRow(db: Database.Database, row: RemoteRow, me: string): Outcome {
  if (!isSyncTable(row.tbl)) return 'rejected'
  const tbl = row.tbl
  const parts = decodeKey(db, tbl, row.key)
  const ts = Number(row.ts)
  if (!parts || !Number.isSafeInteger(ts) || ts < 0 || typeof row.deleted !== 'boolean') return 'rejected'
  const key = row.key as string
  const device = typeof row.device === 'string' ? row.device : ''

  // The server row already won its own last-write-wins contest, so on a tie
  // it beats anything clean here; an unsent local edit is judged the way the
  // server will judge it, by device id.
  const local = getMeta(db, tbl, key)
  const remoteWins = !local || ts > local.ts || (ts === local.ts && (local.dirty === 0 || device > me))
  if (!remoteWins) return 'skipped'

  if (row.deleted) {
    if (tbl === 'tags') return applyTagDelete(db, parts[0], key, ts)
    deleteRow(db, tbl, parts)
  } else {
    const data = cleanData(tbl, parts, row.data)
    if (!data) return 'rejected'
    if (tbl === 'item_tags' && !tagAllowsLink(db, key, parts[2], ts)) return 'skipped'
    upsertRow(db, tbl, data)
  }
  setMeta(db, tbl, key, ts, row.deleted, false)
  return 'applied'
}

/** Apply one page of the feed in one transaction, with change tracking off. */
function applyBatch(db: Database.Database, rows: RemoteRow[], me: string, lastSeq: number): { applied: number; rejected: number } {
  const ordered = rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.tbl) - rank(b.r.tbl) || a.i - b.i)
  let applied = 0, rejected = 0
  db.transaction(() => {
    setState(db, 'applying', '1')
    try {
      for (const { r } of ordered) {
        let outcome: Outcome
        try {
          outcome = db.transaction(() => applyRow(db, r, me))() // savepoint: a row lands whole or not at all
        } catch {
          outcome = 'rejected' // e.g. a NOT NULL column the sender didn't fill
        }
        if (outcome === 'applied') applied++
        else if (outcome === 'rejected') rejected++
      }
      setState(db, 'lastSeq', String(lastSeq))
    } finally {
      setState(db, 'applying', '0')
    }
  })()
  return { applied, rejected }
}

/** Bring in other PCs' changes since the last pull. */
export async function pull(db: Database.Database, remote: Queryable, me: string): Promise<{ pulled: number; rejected: number }> {
  let cursor = Number(getState(db, 'lastSeq') ?? 0) || 0
  const { rows: [top] } = await remote.query<{ table_id: string; max: unknown }>(
    "SELECT 'brickforge_sync'::regclass::oid::text AS table_id, COALESCE(MAX(seq), 0) AS max FROM brickforge_sync")
  const visible = Number(top?.max ?? 0)
  const known = getState(db, 'remoteTable')
  // The table was dropped and recreated, or emptied: send everything again
  if ((known && known !== top?.table_id) || visible < cursor) {
    prepareFullSync(db)
    cursor = 0
  }
  if (top?.table_id) setState(db, 'remoteTable', top.table_id)
  let pulled = 0, rejected = 0
  for (;;) {
    const { rows } = await remote.query<RemoteRow>(`
      SELECT tbl, key, data, deleted, ts, device, seq FROM brickforge_sync
      WHERE seq > $1 AND device <> $2 ORDER BY seq LIMIT ${PULL_BATCH}`, [cursor, me])
    if (!rows.length) break
    cursor = Number(rows[rows.length - 1].seq)
    const res = applyBatch(db, rows, me, cursor)
    pulled += res.applied
    rejected += res.rejected
    if (rows.length < PULL_BATCH) break
  }
  // Everything up to `visible` was committed before we started reading, and
  // the rest of it is ours; skip past it so it isn't rescanned every time.
  if (visible > cursor) setState(db, 'lastSeq', String(visible))
  return { pulled, rejected }
}

// ── Push ─────────────────────────────────────────────────────────────────────

interface Outgoing { tbl: string; key: string; ts: number; deleted: boolean; data: Record<string, unknown> | null }

const DIRTY_SQL = `
  SELECT tbl, key, ts FROM _sync_meta WHERE dirty = 1
  ORDER BY CASE tbl ${TABLE_ORDER.map((t, i) => `WHEN '${t}' THEN ${i}`).join(' ')} ELSE ${TABLE_ORDER.length} END, key
  LIMIT ${PUSH_BATCH}`

function localParts(key: string): string[] | null {
  try {
    const parts: unknown = JSON.parse(key)
    return Array.isArray(parts) && parts.every((p) => typeof p === 'string') ? parts : null
  } catch {
    return null
  }
}

/** Send local changes. A row edited while its batch was in flight stays queued. */
export async function push(db: Database.Database, remote: Queryable, me: string): Promise<number> {
  const clean = stmt(db, 'UPDATE _sync_meta SET dirty = 0, deleted = ? WHERE tbl = ? AND key = ? AND ts = ?')
  let pushed = 0
  for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
    const batch = stmt(db, DIRTY_SQL).all() as { tbl: string; key: string; ts: number }[]
    if (!batch.length) break
    const out: Outgoing[] = []
    const dropped: typeof batch = []
    let size = 0
    for (const m of batch) {
      const parts = isSyncTable(m.tbl) ? localParts(m.key) : null
      if (!parts || parts.length !== TABLES[m.tbl as SyncTable].key.length) { dropped.push(m); continue }
      const data = readRow(db, m.tbl as SyncTable, parts)
      const row: Outgoing = { tbl: m.tbl, key: m.key, ts: m.ts, deleted: !data, data }
      size += JSON.stringify(row).length
      if (out.length && size > MAX_PUSH_CHARS) break // long listings: the rest go in the next round
      out.push(row)
    }
    if (out.length) {
      await inTransaction(remote, async () => {
        await remote.query('SET LOCAL statement_timeout = 30000')
        await remote.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY])
        await remote.query(UPSERT_SQL, [JSON.stringify(out), me])
      })
    }
    db.transaction(() => {
      for (const r of out) clean.run(r.deleted ? 1 : 0, r.tbl, r.key, r.ts)
      for (const m of dropped) clean.run(1, m.tbl, m.key, m.ts) // unsyncable bookkeeping, nothing to send
    })()
    pushed += out.length
  }
  return pushed
}

/** One full round: pull first, so local edits are compared against the latest. */
export async function syncOnce(db: Database.Database, remote: Queryable, me: string): Promise<SyncResult> {
  const { pulled, rejected } = await pull(db, remote, me)
  const pushed = await push(db, remote, me)
  return { pushed, pulled, rejected }
}
