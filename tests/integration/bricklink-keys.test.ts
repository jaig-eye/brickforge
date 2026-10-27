/**
 * BrickLink ids as the minifigures' keys (migration 014 and rekeyFig): an
 * existing collection keyed by Rebrickable numbers moves onto BrickLink ids,
 * with its prices, alerts, and tags, in a way sync can carry to every computer.
 */
import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runMigrations } from '../../electron/db/migrate'
import { closeDb, getDb } from '../../electron/db/index'
import { rekeyFig, rekeyFigsToBricklink, findFig, setFigDetails, updateFig, listFigs } from '../../electron/db/queries/collection.queries'

const MIGRATIONS = path.resolve(__dirname, '../../electron/db/migrations')
const BEFORE_014 = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < '014').sort()

const dirs: string[] = []
afterEach(() => {
  closeDb()
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* Windows may hold a handle briefly */ }
  }
})

/** A collection as 1.0 kept it (migrations through 013), filled by `sql`, then upgraded. */
async function upgraded(sql: string): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-keys-'))
  dirs.push(dir)
  process.env.BRICKFORGE_USER_DATA = dir
  const db = new Database(path.join(dir, 'brickforge.db'))
  db.exec(`CREATE TABLE _migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`)
  for (const f of BEFORE_014) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(f)
  }
  db.exec(sql)
  db.close()
  await runMigrations(MIGRATIONS)
}

const fig = (number: string) => getDb().prepare('SELECT * FROM minifigures WHERE fig_number = ?').get(number) as Record<string, unknown> | undefined
const refs = (tbl: string) => getDb().prepare(`SELECT entity_id FROM ${tbl} WHERE entity_type = 'minifig' ORDER BY entity_id`).all().map((r) => (r as { entity_id: string }).entity_id)
const meta = (tbl: string, key: unknown[]) => getDb().prepare('SELECT deleted, dirty FROM _sync_meta WHERE tbl = ? AND key = ?').get(tbl, JSON.stringify(key)) as { deleted: number; dirty: number } | undefined

const COLLECTION_1_0 = `
  INSERT INTO minifigures (fig_number, name, is_owned, is_wanted, condition, quantity, bricklink_id, notes, acquired_price) VALUES
    ('fig-002514', 'C-3PO, Pearl Gold, Colorful Wires', 1, 0, 'used', 2, 'sw0700', 'On the shelf', 4.5),
    ('fig-011305', 'Amber Grant', 0, 1, 'used', 1, NULL, NULL, NULL),
    ('sh0725', 'Amber Grant', 1, 0, 'new', 1, 'sh0725', NULL, NULL);
  INSERT INTO price_history (entity_type, entity_id, condition, day, avg_price, recorded_at) VALUES
    ('minifig', 'fig-002514', 'used', '2026-10-01', 4.10, '2026-10-01 10:00:00'),
    ('minifig', 'fig-002514', 'used', '2026-10-20', 4.60, '2026-10-20 10:00:00');
  INSERT INTO price_alerts (entity_type, entity_id, condition, direction, target_price) VALUES ('minifig', 'fig-002514', 'used', 'above', 9);
  INSERT INTO tags (name) VALUES ('Droids');
  INSERT INTO item_tags (entity_type, entity_id, tag_id) VALUES ('minifig', 'fig-002514', 1);
`

describe('moving a 1.0 collection onto BrickLink ids', () => {
  it('keeps the Rebrickable number on every fig that has one', async () => {
    await upgraded(COLLECTION_1_0)
    expect(fig('fig-002514')).toMatchObject({ rebrickable_id: 'fig-002514', bricklink_id: 'sw0700' })
    expect(fig('fig-011305')).toMatchObject({ rebrickable_id: 'fig-011305', bricklink_id: null })
    expect(fig('sh0725')).toMatchObject({ rebrickable_id: null })
  })

  it('moves a matched fig to its BrickLink id with its prices, alert, and tag', async () => {
    await upgraded(COLLECTION_1_0)
    expect(rekeyFigsToBricklink()).toBe(1)
    expect(fig('fig-002514')).toBeUndefined()
    expect(fig('sw0700')).toMatchObject({
      bricklink_id: 'sw0700', rebrickable_id: 'fig-002514', quantity: 2, notes: 'On the shelf', acquired_price: 4.5,
      bricklink_url: 'https://www.bricklink.com/v2/catalog/catalogitem.page?M=sw0700',
    })
    expect(refs('price_history')).toEqual(['sw0700', 'sw0700'])
    expect(refs('price_alerts')).toEqual(['sw0700'])
    expect(refs('item_tags')).toEqual(['sw0700'])
    // The priced value follows it too
    expect(listFigs({ scope: 'all' }).find((f) => f.fig_number === 'sw0700')).toMatchObject({ market_price: 4.6, tags: ['Droids'] })
  })

  it('leaves a fig with no known BrickLink id under its Rebrickable number', async () => {
    await upgraded(COLLECTION_1_0)
    rekeyFigsToBricklink()
    expect(fig('fig-011305')).toMatchObject({ is_wanted: 1, rebrickable_id: 'fig-011305' })
  })

  it('records each move for sync as the old key going and the new key arriving', async () => {
    await upgraded(COLLECTION_1_0)
    rekeyFigsToBricklink()
    expect(meta('minifigures', ['fig-002514'])).toEqual({ deleted: 1, dirty: 1 })
    expect(meta('minifigures', ['sw0700'])).toEqual({ deleted: 0, dirty: 1 })
    expect(meta('price_history', ['minifig', 'fig-002514', 'used', '2026-10-20'])).toEqual({ deleted: 1, dirty: 1 })
    expect(meta('price_history', ['minifig', 'sw0700', 'used', '2026-10-20'])).toEqual({ deleted: 0, dirty: 1 })
    expect(meta('price_alerts', ['minifig', 'fig-002514', 'used', 'above'])).toEqual({ deleted: 1, dirty: 1 })
    expect(meta('item_tags', ['minifig', 'sw0700', 'Droids'])).toEqual({ deleted: 0, dirty: 1 })
  })

  it('is safe to repeat: a second pass moves nothing', async () => {
    await upgraded(COLLECTION_1_0)
    rekeyFigsToBricklink()
    expect(rekeyFigsToBricklink()).toBe(0)
    expect(listFigs({ scope: 'all' }).filter((f) => f.bricklink_id === 'sw0700')).toHaveLength(1)
  })
})

describe('one figure under both numbers', () => {
  const BOTH = `
    INSERT INTO minifigures (fig_number, name, is_owned, is_wanted, condition, quantity, bricklink_id, notes, acquired_price, theme) VALUES
      ('fig-002514', 'C-3PO, Pearl Gold', 1, 0, 'used', 1, 'sw0700', 'Bought at a fair', 4.5, 'Star Wars'),
      ('sw0700', 'C-3PO - Colorful Wires', 0, 1, 'new', 3, 'sw0700', NULL, NULL, NULL);
    INSERT INTO price_history (entity_type, entity_id, condition, day, avg_price, recorded_at) VALUES
      ('minifig', 'fig-002514', 'used', '2026-10-01', 4.10, '2026-10-01 10:00:00'),
      ('minifig', 'sw0700', 'used', '2026-10-01', 4.20, '2026-10-01 10:00:00'),
      ('minifig', 'fig-002514', 'used', '2026-10-05', 4.30, '2026-10-05 10:00:00');
  `

  it('become one row: the BrickLink row keeps its fields and takes the larger quantity, never the sum', async () => {
    await upgraded(BOTH)
    rekeyFigsToBricklink()
    const rows = getDb().prepare("SELECT * FROM minifigures WHERE fig_number IN ('fig-002514', 'sw0700') OR rebrickable_id = 'fig-002514'").all()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      fig_number: 'sw0700', name: 'C-3PO - Colorful Wires', condition: 'new', quantity: 3, rebrickable_id: 'fig-002514',
      // Owned on either side means owned, and off the wishlist
      is_owned: 1, is_wanted: 0,
      // Gaps filled from the other row
      notes: 'Bought at a fair', acquired_price: 4.5, theme: 'Star Wars',
    })
  })

  it('keep the BrickLink price where both have one for the same day', async () => {
    await upgraded(BOTH)
    rekeyFigsToBricklink()
    const prices = getDb().prepare("SELECT entity_id, day, avg_price FROM price_history WHERE entity_type = 'minifig' ORDER BY day").all()
    expect(prices).toEqual([
      { entity_id: 'sw0700', day: '2026-10-01', avg_price: 4.2 },
      { entity_id: 'sw0700', day: '2026-10-05', avg_price: 4.3 },
    ])
  })
})

describe('after the move', () => {
  it('the Rebrickable number still finds the fig, and fills in its details', async () => {
    await upgraded(COLLECTION_1_0)
    rekeyFigsToBricklink()
    expect(findFig('fig-002514')?.fig_number).toBe('sw0700')
    setFigDetails('fig-002514', { theme: 'Star Wars', year: 2017 })
    expect(fig('sw0700')).toMatchObject({ theme: 'Star Wars', year: 2017 })
  })

  it('a corrected BrickLink id moves the fig again; clearing it keeps the one it has', async () => {
    await upgraded(COLLECTION_1_0)
    rekeyFigsToBricklink()
    const id = fig('sw0700')!.id as number
    expect(updateFig(id, { bricklink_id: 'sw0701' })).toMatchObject({ fig_number: 'sw0701', rebrickable_id: 'fig-002514' })
    expect(refs('price_history')).toEqual(['sw0701', 'sw0701'])
    expect(updateFig(id, { bricklink_id: null })).toMatchObject({ fig_number: 'sw0701', bricklink_id: 'sw0701' })
  })

  it('finding the BrickLink id for an unmatched fig moves it there', async () => {
    await upgraded(COLLECTION_1_0)
    setFigDetails('fig-011305', { bricklink_id: 'sh0725' })
    // sh0725 was already in the collection: the wishlist copy joins the owned one
    const rows = getDb().prepare("SELECT fig_number, rebrickable_id, is_owned, is_wanted FROM minifigures WHERE fig_number = 'sh0725' OR rebrickable_id = 'fig-011305'").all()
    expect(rows).toEqual([{ fig_number: 'sh0725', rebrickable_id: 'fig-011305', is_owned: 1, is_wanted: 0 }])
  })

  it('a move to something that is not a BrickLink id does nothing', async () => {
    await upgraded(COLLECTION_1_0)
    expect(rekeyFig('fig-011305', 'fig-099999')?.fig_number).toBe('fig-011305')
    expect(rekeyFig('fig-011305', '  ')?.fig_number).toBe('fig-011305')
  })
})
