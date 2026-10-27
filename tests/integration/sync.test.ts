/**
 * Postgres sync between two PCs, against a real Postgres running in this
 * process (PGlite): no Docker, no network.
 *
 * "This PC" is the app's own database, written through the app's real query
 * functions, so these tests also prove every write path is tracked. "The
 * other PC" is a second SQLite file migrated with the same migrations. Both
 * run the sync engine exactly as the app does.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'

// The service connects with pg; here every pg connection is the PGlite database
const fake = vi.hoisted(() => ({
  remote: null as null | { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  failures: new Map<string, { code?: string; message: string }>(),
  configs: [] as Record<string, unknown>[],
}))

vi.mock('pg', () => {
  type Config = { host?: string }
  const connect = (cfg: Config) => {
    const f = fake.failures.get(cfg.host ?? '')
    if (f) throw Object.assign(new Error(f.message), f.code ? { code: f.code } : {})
    if (!fake.remote) throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), { code: 'ECONNREFUSED' })
  }
  class Client {
    constructor(private cfg: Config) { fake.configs.push(cfg as Record<string, unknown>) }
    on() { return this }
    removeListener() { return this }
    async connect() { connect(this.cfg) }
    query(text: string, params?: unknown[]) {
      if (!fake.remote) return Promise.reject(Object.assign(new Error('Connection terminated unexpectedly'), {}))
      return fake.remote.query(text, params)
    }
    release() { /* nothing pooled */ }
    async end() { /* nothing to close */ }
  }
  class Pool {
    constructor(private cfg: Config) { fake.configs.push(cfg as Record<string, unknown>) }
    on() { return this }
    async connect() {
      connect(this.cfg)
      return new Client(this.cfg)
    }
    async end() { /* nothing to close */ }
  }
  return { default: { Pool, Client }, Pool, Client }
})

import { sent } from '../stubs/electron'
import { IPC } from '../../src/lib/ipc-types'
import { AppError } from '../../src/lib/errors'
import { runMigrations } from '../../electron/db/migrate'
import { getDb, closeDb } from '../../electron/db/index'
import { readSettings, writeSettings, setSecret } from '../../electron/main/settings-store'
import {
  addSet, addFig, updateSet, deleteItems, tagItems, untagItems, deleteTag, renameTag, getSetByNumber,
} from '../../electron/db/queries/collection.queries'
import { recordPrice, setAlert } from '../../electron/db/queries/pricing.queries'
import { saveListing } from '../../electron/db/queries/listing.queries'
import {
  ensureRemoteSchema, prepareFullSync, syncOnce, pull, push, pendingCount, type Queryable,
} from '../../electron/services/sync-engine'
import { syncStatus, connectSync, syncNow, disconnectSync, testSyncUrl, startSync, stopSync } from '../../electron/services/sync'

const MIGRATIONS = path.resolve(__dirname, '../../electron/db/migrations')
const THIS_PC = 'a'.repeat(32)
const OTHER_PC = 'b'.repeat(32)

const FALCON = { set_number: '75192-1', name: 'Millennium Falcon', year: 2017, theme: 'Star Wars', piece_count: 7541, image_url: null, rebrickable_url: null }
const HOUSE = { set_number: '10294-1', name: 'Titanic', year: 2021, theme: 'Icons', piece_count: 9090, image_url: null, rebrickable_url: null }
const LUKE = { fig_number: 'sw0001', name: 'Luke Skywalker', image_url: null }

let dir = ''
let pglite: PGlite
let remote: Queryable
const others: Database.Database[] = []

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const sync = (db: Database.Database, device: string) => syncOnce(db, remote, device)

/** This PC: the app database, migrated by the app's runner (optionally only up to some files). */
async function freshThisPc(migrationsDir = MIGRATIONS): Promise<Database.Database> {
  closeDb()
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(path.join(dir, `brickforge.db${suffix}`), { force: true })
  await runMigrations(migrationsDir)
  return getDb()
}

/** Another PC: its own database file, migrated like the app's. */
function otherPc(): Database.Database {
  const db = new Database(path.join(dir, `other-${others.length + 1}.db`))
  others.push(db)
  db.pragma('foreign_keys = ON')
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')
    db.transaction(() => db.exec(sql))()
  }
  return db
}

function stripId<T extends { id?: unknown }>(row: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = row
  return rest
}

/** Everything sync is responsible for, without local ids. */
function snapshot(db: Database.Database) {
  const all = (sql: string) => (db.prepare(sql).all() as { id?: number }[]).map(stripId)
  return {
    sets: all('SELECT * FROM sets ORDER BY set_number'),
    minifigures: all('SELECT * FROM minifigures ORDER BY fig_number'),
    price_history: all('SELECT * FROM price_history ORDER BY entity_type, entity_id, condition, day'),
    price_alerts: all('SELECT * FROM price_alerts ORDER BY entity_type, entity_id, condition, direction'),
    listing_history: all('SELECT * FROM listing_history ORDER BY uid'),
    tags: all('SELECT * FROM tags ORDER BY name'),
    item_tags: links(db),
  }
}

function links(db: Database.Database): string[] {
  return (db.prepare(`
    SELECT it.entity_type || ':' || it.entity_id || ':' || t.name AS link
    FROM item_tags it JOIN tags t ON t.id = it.tag_id ORDER BY 1
  `).all() as { link: string }[]).map((r) => r.link)
}

const tagNames = (db: Database.Database) => (db.prepare('SELECT name FROM tags ORDER BY name').all() as { name: string }[]).map((r) => r.name)
const notesOf = (db: Database.Database, setNumber: string) =>
  (db.prepare('SELECT notes FROM sets WHERE set_number = ?').get(setNumber) as { notes: string | null } | undefined)?.notes
const remoteMaxSeq = async () => Number((await remote.query<{ m: number }>('SELECT COALESCE(MAX(seq), 0) AS m FROM brickforge_sync')).rows[0].m)
const remoteRows = async () => (await remote.query<{ tbl: string; key: string; data: Record<string, unknown> | null; deleted: boolean; device: string }>(
  'SELECT tbl, key, data, deleted, device FROM brickforge_sync ORDER BY tbl, key')).rows

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-sync-'))
  process.env.BRICKFORGE_USER_DATA = dir
  pglite = await PGlite.create()
  remote = pglite
})

beforeEach(async () => {
  await pglite.exec('DROP TABLE IF EXISTS brickforge_sync; DROP SEQUENCE IF EXISTS brickforge_sync_seq;')
  await ensureRemoteSchema(remote)
})

afterAll(async () => {
  stopSync()
  closeDb()
  for (const db of others) db.close()
  await pglite.close()
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

describe('sync engine', () => {
  it('uploads an existing collection in full on first connect, without local ids', async () => {
    // This PC as it was before change tracking: every migration but 013, then a collection
    const before = path.join(dir, 'migrations-012')
    fs.mkdirSync(before, { recursive: true })
    for (const f of fs.readdirSync(MIGRATIONS).filter((f) => !f.startsWith('013'))) fs.copyFileSync(path.join(MIGRATIONS, f), path.join(before, f))
    await freshThisPc(before)
    addSet(FALCON, { as: 'owned', condition: 'sealed', acquired_price: 649.99, notes: 'Display case' })
    addSet(HOUSE, { as: 'wanted' })
    addFig(LUKE, { as: 'owned', condition: 'used' })
    tagItems('set', [FALCON.set_number], ['UCS'])
    recordPrice({ entity_type: 'set', entity_id: FALCON.set_number, condition: 'new', source: 'bricklink', avg_price: 850, min_price: 700, max_price: 990, sample_count: 12 })
    setAlert({ entity_type: 'set', entity_id: HOUSE.set_number, condition: 'new', direction: 'below', target_price: 500 })
    saveListing({ set_number: FALCON.set_number, set_name: FALCON.name, year: 2017, title: 'LEGO 75192', description: '<p>Sealed</p>', provider: 'anthropic' })

    // The upgrade that adds tracking leaves existing rows alone until sync is switched on
    closeDb()
    const a = await freshThisPcKeepingFile()
    expect(pendingCount(a)).toBe(0)

    prepareFullSync(a)
    expect(pendingCount(a)).toBe(8)
    const first = await sync(a, THIS_PC)
    expect(first).toEqual({ pushed: 8, pulled: 0, rejected: 0 })
    expect(pendingCount(a)).toBe(0)

    const rows = await remoteRows()
    expect(rows.map((r) => r.tbl).sort()).toEqual(
      ['item_tags', 'listing_history', 'minifigures', 'price_alerts', 'price_history', 'sets', 'sets', 'tags'])
    for (const r of rows) {
      expect(r.data).not.toHaveProperty('id')
      expect(r.device).toBe(THIS_PC)
    }
    expect(rows.find((r) => r.tbl === 'item_tags')).toMatchObject({
      key: '["set","75192-1","UCS"]', data: { entity_type: 'set', entity_id: '75192-1', tag: 'UCS' },
    })

    const b = otherPc()
    prepareFullSync(b)
    expect(await sync(b, OTHER_PC)).toEqual({ pushed: 0, pulled: 8, rejected: 0 })
    expect(snapshot(b)).toEqual(snapshot(a))
  })

  it('carries an edit from this PC to the other one', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    const { item } = addSet(FALCON, { as: 'owned' })
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    expect(notesOf(b, FALCON.set_number)).toBeNull()

    updateSet(item.id, { notes: 'Shelf 3', quantity: 2, has_box: 1 })
    expect(await sync(a, THIS_PC)).toMatchObject({ pushed: 1 })
    expect(await sync(b, OTHER_PC)).toMatchObject({ pulled: 1, pushed: 0 })
    expect(b.prepare('SELECT notes, quantity, has_box FROM sets WHERE set_number = ?').get(FALCON.set_number))
      .toEqual({ notes: 'Shelf 3', quantity: 2, has_box: 1 })
  })

  it('removes a deleted item, and its tag links, on the other PC', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    const { item } = addSet(FALCON, { as: 'owned' })
    addSet(HOUSE, { as: 'owned' })
    tagItems('set', [FALCON.set_number, HOUSE.set_number], ['Display'])
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    expect(links(b)).toEqual(['set:10294-1:Display', 'set:75192-1:Display'])

    deleteItems('set', [item.id])
    await sync(a, THIS_PC)
    expect(await sync(b, OTHER_PC)).toMatchObject({ pulled: 2 })
    expect(b.prepare('SELECT set_number FROM sets').all()).toEqual([{ set_number: HOUSE.set_number }])
    expect(links(b)).toEqual(['set:10294-1:Display'])
    expect((await remoteRows()).find((r) => r.key === '["75192-1"]')).toMatchObject({ deleted: true, data: null })
  })

  it.each(['this PC', 'the other PC'])('keeps the later of two concurrent edits on both PCs (%s syncs first)', async (first) => {
    const a = await freshThisPc()
    const b = otherPc()
    const { item } = addSet(FALCON, { as: 'owned' })
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)

    updateSet(item.id, { notes: 'edited here' })
    await sleep(5)
    b.prepare("UPDATE sets SET notes = 'edited over there', updated_at = datetime('now') WHERE set_number = ?").run(FALCON.set_number)

    const order: [Database.Database, string][] = first === 'this PC'
      ? [[a, THIS_PC], [b, OTHER_PC], [a, THIS_PC]]
      : [[b, OTHER_PC], [a, THIS_PC], [b, OTHER_PC]]
    for (const [db, device] of order) await sync(db, device)

    expect(notesOf(a, FALCON.set_number)).toBe('edited over there')
    expect(notesOf(b, FALCON.set_number)).toBe('edited over there')
    expect(pendingCount(a) + pendingCount(b)).toBe(0)
  })

  it('breaks an exact timestamp tie the same way on both PCs', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    const { item } = addSet(FALCON, { as: 'owned' })
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    updateSet(item.id, { notes: 'mine' })
    b.prepare("UPDATE sets SET notes = 'theirs' WHERE set_number = ?").run(FALCON.set_number)
    const tie = Date.now() + 60_000
    for (const db of [a, b]) db.prepare("UPDATE _sync_meta SET ts = ? WHERE tbl = 'sets'").run(tie)

    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    await sync(a, THIS_PC)
    // Equal timestamps go to the larger device id ("bbbb…")
    expect(notesOf(a, FALCON.set_number)).toBe('theirs')
    expect(notesOf(b, FALCON.set_number)).toBe('theirs')
  })

  it('keeps tag links right although each PC numbers its tags differently', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    b.exec("INSERT INTO tags (name) VALUES ('Over there 1'), ('Over there 2')") // shifts the other PC's tag ids
    addSet(FALCON, { as: 'owned' })
    addFig(LUKE, { as: 'owned' })
    tagItems('set', [FALCON.set_number], ['Star Wars'])
    tagItems('minifig', [LUKE.fig_number], ['Star Wars', 'Favourites'])
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    await sync(a, THIS_PC)

    const idOf = (db: Database.Database) => (db.prepare("SELECT id FROM tags WHERE name = 'Star Wars'").get() as { id: number }).id
    expect(idOf(b)).not.toBe(idOf(a))
    expect(links(b)).toEqual(['minifig:sw0001:Favourites', 'minifig:sw0001:Star Wars', 'set:75192-1:Star Wars'])
    expect(snapshot(b)).toEqual(snapshot(a))

    // A rename over there moves the links with it
    b.prepare("UPDATE tags SET name = 'SW' WHERE name = 'Star Wars'").run()
    await sync(b, OTHER_PC)
    await sync(a, THIS_PC)
    expect(links(a)).toEqual(['minifig:sw0001:Favourites', 'minifig:sw0001:SW', 'set:75192-1:SW'])
    expect(tagNames(a)).not.toContain('Star Wars')

    // Deleting a tag here removes it, and its links, over there
    deleteTag('SW')
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    await sync(a, THIS_PC)
    expect(tagNames(b)).toEqual(['Favourites', 'Over there 1', 'Over there 2'])
    expect(links(b)).toEqual(['minifig:sw0001:Favourites'])
    expect(snapshot(b)).toEqual(snapshot(a))
    expect(pendingCount(a) + pendingCount(b)).toBe(0)
  })

  it('tracks untagging and renaming through the app functions', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    addSet(FALCON, { as: 'owned' })
    tagItems('set', [FALCON.set_number], ['Old name', 'Temporary'])
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    untagItems('set', [FALCON.set_number], 'Temporary')
    renameTag('Old name', 'New name')
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    expect(links(b)).toEqual(['set:75192-1:New name'])
    expect(tagNames(b)).toEqual(['New name', 'Temporary'])
  })

  it('keeps a tag that gained a link on another PC after it was deleted here', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    addSet(FALCON, { as: 'owned' })
    addSet(HOUSE, { as: 'owned' })
    tagItems('set', [FALCON.set_number], ['Gifts'])
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)

    deleteTag('Gifts')
    await sleep(5)
    b.prepare("INSERT INTO item_tags (entity_type, entity_id, tag_id) SELECT 'set', ?, id FROM tags WHERE name = 'Gifts'").run(HOUSE.set_number)

    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    await sync(a, THIS_PC)
    expect(links(a)).toEqual(['set:10294-1:Gifts'])
    expect(links(b)).toEqual(['set:10294-1:Gifts'])
  })

  it('queues edits made offline and sends them once the database is reachable', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    const offline: Queryable = {
      query: async () => { throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), { code: 'ECONNREFUSED' }) },
    }
    const { item } = addSet(FALCON, { as: 'owned' })
    await expect(syncOnce(a, offline, THIS_PC)).rejects.toMatchObject({ code: 'ECONNREFUSED' })
    updateSet(item.id, { notes: 'Written offline' })
    addFig(LUKE, { as: 'owned' })
    tagItems('minifig', [LUKE.fig_number], ['Offline'])
    expect(pendingCount(a)).toBe(4) // set, fig, tag, link

    // A connection that drops mid-upload leaves nothing half-sent and nothing marked done
    const drops: Queryable = {
      query: (text, params) => (text.includes('INSERT INTO brickforge_sync')
        ? Promise.reject(new Error('Connection terminated unexpectedly'))
        : remote.query(text, params)) as never,
    }
    await expect(syncOnce(a, drops, THIS_PC)).rejects.toThrow('terminated')
    expect(pendingCount(a)).toBe(4)
    expect(await remoteRows()).toEqual([])

    expect(await sync(a, THIS_PC)).toEqual({ pushed: 4, pulled: 0, rejected: 0 })
    expect(pendingCount(a)).toBe(0)
    await sync(b, OTHER_PC)
    expect(snapshot(b)).toEqual(snapshot(a))
  })

  it('does not queue rows it pulled for upload again', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    addSet(FALCON, { as: 'owned' })
    addFig(LUKE, { as: 'owned' })
    tagItems('set', [FALCON.set_number], ['UCS'])
    await sync(a, THIS_PC)

    expect(await pull(b, remote, OTHER_PC)).toEqual({ pulled: 4, rejected: 0 })
    expect(pendingCount(b)).toBe(0)
    expect(b.prepare('SELECT COUNT(*) AS n FROM _sync_meta WHERE dirty = 1').get()).toEqual({ n: 0 })
    expect(b.prepare("SELECT value FROM _sync_state WHERE key = 'applying'").get()).toEqual({ value: '0' })
    expect(await push(b, remote, OTHER_PC)).toBe(0)

    // A link can arrive before its tag; creating the tag for it is not a local edit either
    await remote.query(`
      INSERT INTO brickforge_sync (tbl, key, data, deleted, ts, device, seq)
      VALUES ('item_tags', '["set","75192-1","Arrives later"]', '{"entity_type":"set","entity_id":"75192-1","tag":"Arrives later"}',
              false, $1, $2, nextval('brickforge_sync_seq'))`, [Date.now(), THIS_PC])
    expect(await pull(b, remote, OTHER_PC)).toEqual({ pulled: 1, rejected: 0 })
    expect(links(b)).toContain('set:75192-1:Arrives later')
    expect(pendingCount(b)).toBe(0)
  })

  it('moves nothing when nothing changed, and a repeated first sync rewrites nothing', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    addSet(FALCON, { as: 'owned' })
    tagItems('set', [FALCON.set_number], ['UCS'])
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    const seq = await remoteMaxSeq()

    expect(await sync(a, THIS_PC)).toEqual({ pushed: 0, pulled: 0, rejected: 0 })
    expect(await sync(b, OTHER_PC)).toEqual({ pushed: 0, pulled: 0, rejected: 0 })

    // Reconnecting re-sends everything; identical rows don't change on the server
    prepareFullSync(a)
    expect(await sync(a, THIS_PC)).toMatchObject({ pushed: 3, pulled: 0 })
    expect(await remoteMaxSeq()).toBe(seq)
    expect(await sync(b, OTHER_PC)).toEqual({ pushed: 0, pulled: 0, rejected: 0 })
  })

  it('tracks both a new price and a same-day price update', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    const price = (avg: number, day?: string) => recordPrice({
      entity_type: 'set', entity_id: FALCON.set_number, condition: 'new', source: 'bricklink',
      avg_price: avg, min_price: null, max_price: null, sample_count: 3,
    }, day)
    price(800)
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    price(825) // same day: recordPrice's ON CONFLICT DO UPDATE path
    price(700, '2026-01-15')
    expect(await sync(a, THIS_PC)).toMatchObject({ pushed: 2 })
    await sync(b, OTHER_PC)
    expect(b.prepare('SELECT day, avg_price FROM price_history ORDER BY day').all().map((r) => (r as { avg_price: number }).avg_price))
      .toEqual([700, 825])
    expect((await remoteRows()).filter((r) => r.tbl === 'price_history')).toHaveLength(2)
  })

  it('splits a large upload into several transactions', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    for (let i = 0; i < 25; i++) {
      saveListing({ set_number: FALCON.set_number, set_name: FALCON.name, year: 2017, title: `Listing ${i}`, description: 'x'.repeat(90_000), provider: null })
    }
    const statements: string[] = []
    const watched: Queryable = { query: (text, params) => { statements.push(text); return remote.query(text, params) as never } }
    expect(await syncOnce(a, watched, THIS_PC)).toMatchObject({ pushed: 25 })
    expect(statements.filter((s) => s === 'COMMIT').length).toBeGreaterThan(1)
    expect(await sync(b, OTHER_PC)).toMatchObject({ pulled: 25 })
    expect(snapshot(b)).toEqual(snapshot(a))
  })

  it('refuses server rows that are not what BrickForge writes', async () => {
    const b = otherPc()
    const insert = (tbl: string, key: string, data: unknown) => remote.query(
      `INSERT INTO brickforge_sync (tbl, key, data, deleted, ts, device, seq)
       VALUES ($1, $2, $3::jsonb, false, $4, 'mallory', nextval('brickforge_sync_seq'))`,
      [tbl, key, JSON.stringify(data), Date.now()])
    const set = { name: 'A set', is_owned: 1, is_wanted: 0, quantity: 1, condition: 'sealed' }
    await insert('scan_jobs', '["1"]', { image_path: 'C:/Windows/system32' })         // not a synced table
    await insert('sets', '[ "9001-1" ]', set)                                            // not the canonical key
    await insert('sets', '["9002-1"]', { ...set, name: 12345 })                          // wrong type
    await insert('sets', '["9003-1"]', { ...set, name: 'x'.repeat(5000) })               // too long
    await insert('minifigures', '["fig-1"]', null)                                       // live row without data
    await insert('price_alerts', '["set","9004-1","new","sideways"]', { target_price: 1 }) // unknown direction
    await insert('sets', '["9005-1"]', { ...set, set_number: 'SMUGGLED-1' })             // data can't rename the row
    await insert('sets', '["9006-1"]', { ...set, condition: 'MINT!!', 'name = 1; DROP TABLE sets; --': 'x' })

    expect(await pull(b, remote, OTHER_PC)).toEqual({ pulled: 2, rejected: 6 })
    expect(b.prepare('SELECT set_number, condition FROM sets ORDER BY set_number').all()).toEqual([
      { set_number: '9005-1', condition: 'sealed' },
      { set_number: '9006-1', condition: 'open_complete' },
    ])
    expect(await pull(b, remote, OTHER_PC)).toEqual({ pulled: 0, rejected: 0 })
  })

  it('sends everything again when the server table is dropped and recreated', async () => {
    const a = await freshThisPc()
    const b = otherPc()
    addSet(FALCON, { as: 'owned' })
    addFig(LUKE, { as: 'owned' })
    await sync(a, THIS_PC)
    await sync(b, OTHER_PC)
    await sync(a, THIS_PC)

    await pglite.exec('DROP TABLE brickforge_sync; DROP SEQUENCE brickforge_sync_seq;')
    await ensureRemoteSchema(remote)
    b.prepare("UPDATE sets SET notes = 'after the reset' WHERE set_number = ?").run(FALCON.set_number)
    expect(await sync(b, OTHER_PC)).toMatchObject({ pushed: 2 })
    await sync(a, THIS_PC)
    expect(notesOf(a, FALCON.set_number)).toBe('after the reset')
    expect((await remoteRows()).map((r) => r.key)).toEqual(['["sw0001"]', '["75192-1"]'])
    expect(snapshot(b)).toEqual(snapshot(a))
  })
})

describe('sync service', () => {
  const URL = 'postgresql://collector:s3cret-Pa55@db.example.test:5432/bricks?sslmode=require'

  beforeEach(async () => {
    stopSync()
    fake.remote = pglite
    fake.failures.clear()
    setSecret('sync', '')
    writeSettings({ syncEnabled: false })
    await freshThisPc()
  })

  it('connects, syncs, and never shows the connection string', async () => {
    addSet(FALCON, { as: 'owned' })
    sent.length = 0
    const status = await connectSync(URL)
    stopSync()
    expect(status).toMatchObject({ enabled: true, configured: true, state: 'idle', pushed: 1, pulled: 0, pending: 0, lastError: null })
    expect(status.lastSyncAt).toBeTruthy()
    expect(readSettings().syncEnabled).toBe(true)
    expect(readSettings().syncDeviceId).toMatch(/^[0-9a-f]{32}$/)
    expect(fake.configs.at(-1)).toMatchObject({ host: 'db.example.test', port: 5432, database: 'bricks', ssl: { rejectUnauthorized: false } })

    const shown = JSON.stringify([status, syncStatus(), sent.filter((s) => s.channel === IPC.PUSH_SYNC)])
    expect(sent.some((s) => s.channel === IPC.PUSH_SYNC)).toBe(true)
    expect(shown).not.toContain('s3cret-Pa55')
    expect(shown).not.toContain('postgresql://')
    expect(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).not.toContain('s3cret-Pa55')

    const id = getSetByNumber(FALCON.set_number)!.id
    updateSet(id, { notes: 'Synced by hand' })
    expect(syncStatus().pending).toBe(1)
    expect(await syncNow()).toMatchObject({ state: 'idle', pushed: 1, pending: 0 })

    const off = await disconnectSync()
    expect(off).toMatchObject({ enabled: false, configured: false, state: 'off', pending: 0 })
    expect(readSettings().syncDatabaseUrl).toBeFalsy()
    expect(getSetByNumber(FALCON.set_number)).not.toBeNull()       // nothing deleted here...
    expect((await remoteRows()).length).toBe(1)                      // ...or on the server
  })

  it('tells the user what went wrong and saves nothing when connecting fails', async () => {
    fake.failures.set('wrong.example.test', { code: '28P01', message: 'password authentication failed for user "collector"' })
    const err = await connectSync('postgresql://collector:nope@wrong.example.test/bricks').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toMatchObject({ code: 'auth', service: 'postgres' })
    expect((err as Error).message).toMatch(/password/)
    expect(readSettings().syncDatabaseUrl).toBeFalsy()
    expect(syncStatus()).toMatchObject({ enabled: false, state: 'off' })

    fake.failures.set('nowhere.example.test', { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND nowhere.example.test' })
    await expect(testSyncUrl('postgresql://u:p@nowhere.example.test/db')).rejects.toMatchObject({ code: 'network' })
    await expect(testSyncUrl('mysql://u:p@db.example.test/db')).rejects.toMatchObject({ code: 'invalid_input' })
    expect(await testSyncUrl('postgresql://u:p@db.example.test/db')).toMatch(/^Connected to PostgreSQL \d+/)
  })

  it('records a failed sync in the status, and recovers', async () => {
    await connectSync(URL)
    stopSync()
    fake.remote = null
    await expect(syncNow()).rejects.toMatchObject({ code: 'network' })
    const failed = syncStatus()
    expect(failed).toMatchObject({ enabled: true, state: 'error' })
    expect(failed.lastError).toMatch(/refused/)
    expect(JSON.stringify(failed)).not.toContain('s3cret-Pa55')

    fake.remote = pglite
    expect(await syncNow()).toMatchObject({ state: 'idle', lastError: null })
  })

  it('syncs in the background on start and soon after a local edit', async () => {
    await connectSync(URL)
    stopSync()
    addSet(HOUSE, { as: 'owned' })
    startSync()
    await vi.waitFor(async () => expect((await remoteRows()).map((r) => r.key)).toContain('["10294-1"]'), { timeout: 8_000, interval: 250 })

    updateSet(getSetByNumber(HOUSE.set_number)!.id, { notes: 'Background' })
    await vi.waitFor(async () => {
      const row = (await remoteRows()).find((r) => r.key === '["10294-1"]')
      expect(row?.data?.notes).toBe('Background')
    }, { timeout: 15_000, interval: 250 })
    stopSync()
  }, 30_000)
})

/** Reopen this PC's database file and bring it to the latest schema (the 013 upgrade). */
async function freshThisPcKeepingFile(): Promise<Database.Database> {
  await runMigrations(MIGRATIONS)
  return getDb()
}
