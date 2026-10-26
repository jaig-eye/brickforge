/**
 * Upgrading real alpha databases: build one at the old schema from the
 * migration files themselves, fill it with legacy-shaped rows, then run the
 * app's own runMigrations() over it.
 */
import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runMigrations } from '../../electron/db/migrate'
import { closeDb, getDb } from '../../electron/db/index'

const MIGRATIONS = path.resolve(__dirname, '../../electron/db/migrations')
const ALL = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
const upTo = (last: string) => ALL.filter((f) => f.slice(0, 3) <= last)

const dirs: string[] = []
afterEach(() => {
  closeDb()
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* Windows may hold a handle briefly */ }
  }
})

/** A fresh userData folder holding brickforge.db migrated with exactly `files`. */
function oldDatabase(files: string[]): { dir: string; db: Database.Database } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-migrate-'))
  dirs.push(dir)
  process.env.BRICKFORGE_USER_DATA = dir
  const db = new Database(path.join(dir, 'brickforge.db'))
  // The bookkeeping table exactly as runMigrations creates it
  db.exec(`CREATE TABLE _migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`)
  for (const f of files) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(f)
  }
  return { dir, db }
}

const tables = () => (getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name)
const columns = (table: string) => (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string; dflt_value: string | null }[])
const applied = () => (getDb().prepare('SELECT filename FROM _migrations ORDER BY filename').all() as { filename: string }[]).map((r) => r.filename)

describe('upgrading an alpha database (001–011) to v1', () => {
  function legacyDatabase(): string {
    const { dir, db } = oldDatabase(upTo('011'))
    db.exec(`
      INSERT INTO sets (set_number, name, year, theme, is_owned, condition, quantity, acquired_price, notes)
        VALUES ('75192-1', 'Millennium Falcon', 2017, 'Star Wars', 1, 'sealed', 1, 650, 'Shelf A'),
               ('10497-1', 'Galaxy Explorer', 2022, 'Icons', 1, 'open_complete', 2, NULL, NULL);
      INSERT INTO minifigures (fig_number, name, is_owned, condition, bricklink_id) VALUES ('fig-002514', 'C-3PO', 1, 'cracked', 'sw0700');

      -- Refreshing several times a day used to stack rows
      INSERT INTO price_history (entity_type, entity_id, condition, avg_price, recorded_at) VALUES
        ('set', '75192-1', 'new', 700, '2026-10-01 08:00:00'),
        ('set', '75192-1', 'new', 705, '2026-10-01 13:00:00'),
        ('set', '75192-1', 'new', 710, '2026-10-01 20:00:00'),
        ('set', '75192-1', 'used', 500, '2026-10-01 20:00:00'),
        ('set', '75192-1', 'new', 720, '2026-10-02 09:00:00'),
        ('minifig', 'fig-002514', 'used', 3.5, '2026-09-15 10:00:00'),
        ('minifig', 'fig-002514', 'used', 3.6, '2026-09-15 11:00:00'),
        ('minifig', 'fig-002514', 'used', 3.7, '2026-09-15 12:00:00');

      INSERT INTO price_alerts (entity_type, entity_id, target_price, condition) VALUES
        ('set', '75192-1', 600, 'new'), ('set', '75192-1', 550, 'new'), ('set', '10497-1', 80, 'used');

      INSERT INTO feature_flags (key, enabled) VALUES ('legacy_flag', 1);
      INSERT INTO ai_scan_cache (image_hash, scan_type, result_json) VALUES ('abc', 'minifig', '{}');
      INSERT INTO pieces (part_number, color_id, name) VALUES ('3001', 5, 'Brick 2 x 4');
      INSERT INTO set_minifigures (set_id, fig_id) VALUES (1, 1);

      INSERT INTO listing_history (set_number, set_name, title, description) VALUES
        ('75192-1', 'Millennium Falcon', 'A', '<p>a</p>'), ('75192-1', 'Millennium Falcon', 'B', '<p>b</p>'), ('10497-1', 'Galaxy Explorer', 'C', '<p>c</p>');

      INSERT INTO tags (name) VALUES ('UCS');
      INSERT INTO item_tags (entity_type, entity_id, tag_id) VALUES ('set', '75192-1', 1), ('set', 'gone-1', 1), ('minifig', 'fig-gone', 1), ('minifig', 'fig-002514', 1);

      INSERT INTO scan_jobs (scan_type, image_path, status) VALUES ('minifig', 'C:/scans/a.jpg', 'done');
    `)
    db.close()
    return dir
  }

  it('applies only the v1 migration and records it', async () => {
    const dir = legacyDatabase()
    await runMigrations(MIGRATIONS)
    expect(applied()).toEqual(ALL)
    // A snapshot is taken before the schema is touched
    expect(fs.readdirSync(path.join(dir, 'backups')).some((f) => f.startsWith('brickforge-pre-migration-'))).toBe(true)
  })

  it('keeps one price per item, condition, and day — the latest refresh of that day', async () => {
    legacyDatabase()
    await runMigrations(MIGRATIONS)
    const rows = getDb().prepare('SELECT entity_id, condition, day, avg_price FROM price_history ORDER BY entity_id, condition, day').all()
    expect(rows).toEqual([
      { entity_id: '75192-1', condition: 'new', day: '2026-10-01', avg_price: 710 },
      { entity_id: '75192-1', condition: 'new', day: '2026-10-02', avg_price: 720 },
      { entity_id: '75192-1', condition: 'used', day: '2026-10-01', avg_price: 500 },
      { entity_id: 'fig-002514', condition: 'used', day: '2026-09-15', avg_price: 3.7 },
    ])
    expect(() => getDb().prepare("INSERT INTO price_history (entity_type, entity_id, condition, avg_price, day) VALUES ('set', '75192-1', 'new', 1, '2026-10-02')").run())
      .toThrow(/UNIQUE/)
  })

  it('gives alerts a direction that defaults to "below", one per item, condition, and direction', async () => {
    legacyDatabase()
    await runMigrations(MIGRATIONS)
    const alerts = getDb().prepare('SELECT entity_id, condition, direction, target_price FROM price_alerts ORDER BY entity_id').all()
    expect(alerts).toEqual([
      { entity_id: '10497-1', condition: 'used', direction: 'below', target_price: 80 },
      { entity_id: '75192-1', condition: 'new', direction: 'below', target_price: 550 },
    ])
    expect(columns('price_alerts').find((c) => c.name === 'direction')?.dflt_value).toBe("'below'")
    getDb().prepare("INSERT INTO price_alerts (entity_type, entity_id, target_price, condition) VALUES ('set', '21330-1', 100, 'new')").run()
    expect(getDb().prepare("SELECT direction FROM price_alerts WHERE entity_id = '21330-1'").get()).toEqual({ direction: 'below' })
  })

  it('gives every listing a unique uid', async () => {
    legacyDatabase()
    await runMigrations(MIGRATIONS)
    const uids = (getDb().prepare('SELECT uid FROM listing_history').all() as { uid: string }[]).map((r) => r.uid)
    expect(uids).toHaveLength(3)
    for (const uid of uids) expect(uid).toMatch(/^[0-9a-f]{32}$/)
    expect(new Set(uids).size).toBe(3)
    expect(() => getDb().prepare("INSERT INTO listing_history (uid, set_number, set_name, title, description) VALUES (?, 'x', 'x', 'x', 'x')").run(uids[0]))
      .toThrow(/UNIQUE/)
  })

  it('drops the retired tables and dangling tag links, and keeps your collection', async () => {
    legacyDatabase()
    await runMigrations(MIGRATIONS)
    for (const t of ['feature_flags', 'ai_scan_cache', 'set_minifigures', 'pieces']) expect(tables()).not.toContain(t)
    expect(getDb().prepare('SELECT entity_type, entity_id FROM item_tags ORDER BY entity_type').all()).toEqual([
      { entity_type: 'minifig', entity_id: 'fig-002514' },
      { entity_type: 'set', entity_id: '75192-1' },
    ])
    expect(getDb().prepare('SELECT set_number, condition, quantity, acquired_price, notes FROM sets ORDER BY set_number').all()).toEqual([
      { set_number: '10497-1', condition: 'open_complete', quantity: 2, acquired_price: null, notes: null },
      { set_number: '75192-1', condition: 'sealed', quantity: 1, acquired_price: 650, notes: 'Shelf A' },
    ])
    expect(getDb().prepare('SELECT fig_number, condition, bricklink_id FROM minifigures').all()).toEqual([{ fig_number: 'fig-002514', condition: 'cracked', bricklink_id: 'sw0700' }])
    expect(getDb().prepare('SELECT status, split_pending, is_crop FROM scan_jobs').all()).toEqual([{ status: 'done', split_pending: 0, is_crop: 0 }])
  })

  it('does nothing (not even a backup) when the database is already current', async () => {
    const dir = legacyDatabase()
    await runMigrations(MIGRATIONS)
    closeDb()
    const backups = fs.readdirSync(path.join(dir, 'backups')).length
    await runMigrations(MIGRATIONS)
    expect(applied()).toEqual(ALL)
    expect(fs.readdirSync(path.join(dir, 'backups'))).toHaveLength(backups)
  })
})

describe('older databases', () => {
  it('a database from before conditions were renamed (001–004) ends up with the 3-value model', async () => {
    const { db } = oldDatabase(upTo('004'))
    db.exec(`
      INSERT INTO sets (set_number, name, condition, is_owned) VALUES ('1-1', 'A', 'new', 1), ('2-1', 'B', 'used', 1), ('3-1', 'C', 'sealed', 1);
      INSERT INTO minifigures (fig_number, name, is_owned) VALUES ('sw0700', 'C-3PO', 1);
    `)
    db.close()
    await runMigrations(MIGRATIONS)
    expect(getDb().prepare('SELECT set_number, condition FROM sets ORDER BY set_number').all()).toEqual([
      { set_number: '1-1', condition: 'sealed' }, { set_number: '2-1', condition: 'open_complete' }, { set_number: '3-1', condition: 'sealed' },
    ])
    expect(getDb().prepare('SELECT condition, quantity FROM minifigures').get()).toEqual({ condition: 'used', quantity: 1 })
    expect(applied()).toEqual(ALL)
  })
})

describe('a migration that fails', () => {
  const BROKEN = `
    CREATE TABLE half_done (id INTEGER PRIMARY KEY);
    INSERT INTO half_done (id) VALUES (1);
    ALTER TABLE sets ADD COLUMN half_col TEXT;
    UPDATE sets SET name = 'CLOBBERED';
    INSERT INTO no_such_table VALUES (1);
  `

  /** A migrations folder: the real files up to `through`, plus extra ones. */
  function migrationsDir(through: string, extra: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-migrations-'))
    dirs.push(dir)
    for (const f of upTo(through)) fs.copyFileSync(path.join(MIGRATIONS, f), path.join(dir, f))
    for (const [name, sql] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), sql)
    return dir
  }

  it('rolls back completely: no partial schema, no changed rows, no bookkeeping row', async () => {
    const { db } = oldDatabase(upTo('012'))
    db.exec("INSERT INTO sets (set_number, name, is_owned) VALUES ('75192-1', 'Millennium Falcon', 1)")
    db.close()
    const dir = migrationsDir('012', { '900_broken.sql': BROKEN })

    await expect(runMigrations(dir)).rejects.toThrow(/no such table/)
    expect(tables()).not.toContain('half_done')
    expect(columns('sets').map((c) => c.name)).not.toContain('half_col')
    expect(getDb().prepare('SELECT name FROM sets').all()).toEqual([{ name: 'Millennium Falcon' }])
    expect(applied()).not.toContain('900_broken.sql')
  })

  it('keeps the migrations before it and stops before the ones after it', async () => {
    const { db } = oldDatabase(upTo('011'))
    db.close()
    const dir = migrationsDir('012', { '900_broken.sql': BROKEN, '901_after.sql': 'CREATE TABLE after_table (id INTEGER);' })

    await expect(runMigrations(dir)).rejects.toThrow()
    expect(applied()).toEqual([...upTo('012')])
    expect(columns('price_history').map((c) => c.name)).toContain('day') // 012 landed
    expect(tables()).not.toContain('after_table')

    // Once the broken file is fixed, the next start picks up where it stopped
    fs.writeFileSync(path.join(dir, '900_broken.sql'), 'CREATE TABLE fixed_table (id INTEGER);')
    closeDb()
    await runMigrations(dir)
    expect(applied()).toEqual([...upTo('012'), '900_broken.sql', '901_after.sql'])
    expect(tables()).toEqual(expect.arrayContaining(['fixed_table', 'after_table']))
  })
})
