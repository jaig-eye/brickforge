/**
 * Everything the renderer sends is untrusted. These tests send what a
 * compromised or buggy page might: wrong types, oversized text, rows with
 * extra columns, paths outside the data folder, and dangerous URLs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { shell } from 'electron'
import { createTestEnv, type TestEnv } from '../helpers/env'
import { IPC } from '../../src/lib/ipc-types'
import type { AddResult, BackupInfo, CollectionSet, Minifigure, PublicSettings, Tag } from '../../src/lib/types'
import { getDb } from '../../electron/db/index'

let env: TestEnv
const listSets = () => env.call<CollectionSet[]>(IPC.SETS_LIST, { scope: 'all' })
const code = async (channel: string, ...args: unknown[]) => {
  const res = await env.invoke(channel, ...args)
  return res.ok ? 'ok' : res.error.code
}

beforeAll(async () => { env = await createTestEnv() })
afterAll(() => env?.close())

describe('argument types', () => {
  it('rejects ids that are not whole numbers', async () => {
    expect(await code(IPC.SET_UPDATE, 'abc', { notes: 'x' })).toBe('invalid_input')
    expect(await code(IPC.SET_UPDATE, 1.5, { notes: 'x' })).toBe('invalid_input')
    expect(await code(IPC.FIG_UPDATE, Number.NaN, {})).toBe('invalid_input')
    expect(await code(IPC.FIG_RESOLVE_BL, '1; DROP TABLE minifigures')).toBe('invalid_input')
    expect(await code(IPC.ALERT_DELETE, { id: 1 })).toBe('invalid_input')
    expect(await code(IPC.SCAN_RETRY, 'all')).toBe('invalid_input')
    expect(await code(IPC.SELL_DELETE, '2.5')).toBe('invalid_input')
  })

  it('rejects an item kind other than "set" or "minifig"', async () => {
    expect(await code(IPC.ITEMS_DELETE, 'part', [1])).toBe('invalid_input')
    expect(await code(IPC.ITEMS_BULK_UPDATE, 'sets', [1], { condition: 'sealed' })).toBe('invalid_input')
    expect(await code(IPC.ITEMS_RESTORE, "set' OR 1=1 --", [])).toBe('invalid_input')
    expect(await code(IPC.PRICE_HISTORY, 'lego', '75192-1')).toBe('invalid_input')
    expect(await code(IPC.TAGS_APPLY, 'fig', ['x'], ['y'])).toBe('invalid_input')
    expect(await code(IPC.ALERT_SET, { entity_type: 'part', entity_id: '3001', target_price: 1 })).toBe('invalid_input')
  })

  it('rejects text arguments that are not text', async () => {
    expect(await code(IPC.ADD_SET, 75192, { as: 'owned' })).toBe('invalid_input')
    expect(await code(IPC.ADD_FIG, { set_num: 700 }, {})).toBe('invalid_input')
    expect(await code(IPC.ADD_FIG, { set_num: '   ' }, {})).toBe('invalid_input')
    expect(await code(IPC.SELL_GENERATE, null, {})).toBe('invalid_input')
    expect(await code(IPC.APP_OPEN_EXTERNAL, { href: 'https://example.com' })).toBe('invalid_input')
    expect(await code(IPC.TAGS_APPLY, 'set', [{}], ['x'])).toBe('invalid_input')
  })

  it('rejects a list argument that is not a list, and drops junk entries from one that is', async () => {
    expect(await code(IPC.ITEMS_DELETE, 'set', '1,2,3')).toBe('invalid_input')
    expect(await code(IPC.SCAN_DISMISS, { 0: 1 })).toBe('invalid_input')
    expect(await env.call(IPC.ITEMS_DELETE, 'set', [1, 'x', 2.5, null, {}])).toEqual([])
  })

  it('rejects a set number that does not look like one, before any request', async () => {
    expect(await code(IPC.ADD_SET, '75192; DROP TABLE sets', { as: 'owned' })).toBe('invalid_input')
    expect(await code(IPC.ADD_SET, '../../etc', { as: 'owned' })).toBe('invalid_input')
    expect(await code(IPC.ADD_SET, '7'.repeat(100), { as: 'owned' })).toBe('invalid_input')
    expect(env.apis.requests).toHaveLength(0)
  })

  it('ignores scan uploads that are not images', async () => {
    expect(await env.call(IPC.SCAN_ENQUEUE, 'not a list', {})).toEqual({ enqueued: 0 })
    expect(await env.call(IPC.SCAN_ENQUEUE, [42, null, 'c2hvcnQ='], { scanType: 'set' })).toEqual({ enqueued: 0 })
    expect(await code(IPC.SCAN_PIECE, 12345)).toBe('invalid_input')
  })

  it('falls back to the default order for a sort key it does not know', async () => {
    for (const sort of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'name; DROP TABLE sets', 'value']) {
      expect(await code(IPC.SETS_LIST, { scope: 'all', sort, dir: 'asc' }), sort).toBe('ok')
      expect(await code(IPC.FIGS_LIST, { scope: 'all', sort }), sort).toBe('ok')
    }
  })

  it('refuses an unknown AI provider', async () => {
    expect((await env.invoke(IPC.SETTINGS_SET_AI, 'skynet', 'gpt-9')).ok).toBe(false)
    expect((await env.call<PublicSettings>(IPC.SETTINGS_GET)).aiProvider).toBe('anthropic')
  })
})

describe('oversized text', () => {
  it('is truncated, not stored whole', async () => {
    const { item } = await env.call<AddResult<Minifigure>>(IPC.ADD_FIG,
      { set_num: 'sw0700', name: 'N'.repeat(1000), theme: 'T'.repeat(500) },
      { as: 'owned', notes: 'x'.repeat(5000), condition: 'c'.repeat(500) })
    expect(item.name).toHaveLength(300)
    expect(item.theme).toHaveLength(120)
    expect(item.notes).toHaveLength(2000)
    expect(item.condition).toBe('used')

    await env.call(IPC.TAGS_APPLY, 'minifig', ['sw0700'], ['L'.repeat(100)])
    expect((await env.call<Tag[]>(IPC.TAGS_LIST)).map((t) => t.name)).toEqual(['L'.repeat(40)])

    const s = await env.call<PublicSettings>(IPC.SETTINGS_SET_AI, 'openai', 'm'.repeat(500))
    expect(s.aiModel).toHaveLength(80)
  })
})

describe('undo rows from the renderer', () => {
  it('restore writes only known columns and ignores the rest', async () => {
    const restored = await env.call<number>(IPC.ITEMS_RESTORE, 'set', [{
      set_number: '99001-1', name: 'Restored Set', is_owned: 1, quantity: 2, condition: 'sealed',
      id: 4242,
      evil: 'ignored',
      "name) VALUES ('x'); DROP TABLE sets; --": 'ignored',
      'notes, is_owned) SELECT name': 'ignored',
      tags: ['Restored'],
    }])
    expect(restored).toBe(1)
    const row = (await listSets()).find((s) => s.set_number === '99001-1')!
    expect(row).toMatchObject({ name: 'Restored Set', quantity: 2, is_owned: 1, tags: ['Restored'] })
    expect(row.id).not.toBe(4242)
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'sets'").get()).toEqual({ n: 1 })
  })

  it('restore skips rows without a usable item number', async () => {
    const n = await env.call<number>(IPC.ITEMS_RESTORE, 'set', [{ name: 'no number' }, { set_number: 123, name: 'x' }, null, 'row', [1, 2]])
    expect(n).toBe(0)
    expect(await env.call<number>(IPC.ITEMS_RESTORE, 'set', 'not a list')).toBe(0)
  })
})

describe('backups', () => {
  it('restores a listed backup by name', async () => {
    const name = await env.call<string>(IPC.DATA_BACKUP_NOW)
    expect(name).toMatch(/^brickforge-manual-.+\.db$/)
    await env.call(IPC.ITEMS_RESTORE, 'set', [{ set_number: 'AFTER-1', name: 'Added after the backup', is_owned: 1 }])
    const pushes = env.pushes(IPC.PUSH_DATA_CHANGED).length

    expect(await env.call(IPC.DATA_BACKUP_RESTORE, name)).toEqual({ restored: true })
    const sets = (await listSets()).map((s) => s.set_number)
    expect(sets).toContain('99001-1')
    expect(sets).not.toContain('AFTER-1')
    expect(env.pushes(IPC.PUSH_DATA_CHANGED).slice(pushes)).toContainEqual({ kind: 'all' })
    // The database it replaced was snapshotted first
    expect((await env.call<BackupInfo[]>(IPC.DATA_BACKUP_LIST)).map((b) => b.label)).toEqual(expect.arrayContaining(['manual', 'pre-restore']))
  })

  it('refuses a backup name that points outside the backups folder', async () => {
    // A real database sitting next to the backups folder
    const evil = new Database(path.join(env.dir, 'evil.db'))
    evil.exec("CREATE TABLE sets (id INTEGER PRIMARY KEY, set_number TEXT, name TEXT); INSERT INTO sets (set_number, name) VALUES ('EVIL-1', 'Planted');")
    evil.close()
    for (const name of ['../evil.db', '../../evil.db', '..\\evil.db', path.join(env.dir, 'evil.db'), 'backups/../../evil.db', 'evil.db']) {
      expect(await env.invoke(IPC.DATA_BACKUP_RESTORE, name), name).toMatchObject({ ok: false, error: { code: 'not_found' } })
    }
    expect((await listSets()).map((s) => s.set_number)).not.toContain('EVIL-1')
  })

  it('refuses a file in the backups folder that is not a database, leaving yours open', async () => {
    fs.writeFileSync(path.join(env.dir, 'backups', 'junk.db'), 'definitely not SQLite')
    expect((await env.invoke(IPC.DATA_BACKUP_RESTORE, 'junk.db')).ok).toBe(false)
    expect((await listSets()).map((s) => s.set_number)).toContain('99001-1')
  })
})

describe('external links', () => {
  it('opens web and mail links in the browser', async () => {
    const open = vi.spyOn(shell, 'openExternal').mockResolvedValue(undefined)
    await env.call(IPC.APP_OPEN_EXTERNAL, 'https://www.bricklink.com/v2/catalog/catalogitem.page?S=75192-1')
    await env.call(IPC.APP_OPEN_EXTERNAL, 'mailto:hello@example.com')
    await env.call(IPC.APP_OPEN_EXTERNAL, 'http://example.com/a b')
    expect(open.mock.calls.map(([url]) => url)).toEqual([
      'https://www.bricklink.com/v2/catalog/catalogitem.page?S=75192-1',
      'mailto:hello@example.com',
      'http://example.com/a%20b',
    ])
  })

  it('never opens file:, javascript:, or other non-web URLs', async () => {
    const open = vi.spyOn(shell, 'openExternal').mockResolvedValue(undefined)
    for (const url of [
      'file:///C:/Windows/System32/calc.exe',
      'FILE://server/share/run.exe',
      'javascript:alert(1)',
      'JavaScript:alert(document.cookie)',
      '  javascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'ms-settings:privacy',
      'smb://server/share',
      '\\\\server\\share\\run.exe',
      'C:\\Windows\\System32\\calc.exe',
      'not a url at all',
      '',
    ]) {
      expect(await env.invoke(IPC.APP_OPEN_EXTERNAL, url), url).toMatchObject({ ok: true })
    }
    expect(open).not.toHaveBeenCalled()
  })
})
