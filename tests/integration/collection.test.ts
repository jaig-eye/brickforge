/**
 * The collection through IPC, the way the renderer uses it. One environment
 * for the whole file; tests build on each other in order.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv, type TestEnv } from '../helpers/env'
import { VALID_KEYS } from '../helpers/fake-apis'
import { IPC } from '../../src/lib/ipc-types'
import type { AddResult, CollectionFig, CollectionSet, LegoSet, Minifigure, OwnershipIndex, Tag } from '../../src/lib/types'
import type { DeletedRow } from '../../electron/db/queries/collection.queries'

let env: TestEnv
const today = () => new Date().toISOString().slice(0, 10)

const listSets = (scope: 'owned' | 'wanted' | 'all' = 'all') => env.call<CollectionSet[]>(IPC.SETS_LIST, { scope })
const listFigs = (scope: 'owned' | 'wanted' | 'all' = 'all') => env.call<CollectionFig[]>(IPC.FIGS_LIST, { scope })
const findSet = async (num: string) => (await listSets()).find((s) => s.set_number === num)
const addSet = (num: string, opts: Record<string, unknown>) => env.call<AddResult<LegoSet>>(IPC.ADD_SET, num, opts)
const addFig = (fig: Record<string, unknown>, opts: Record<string, unknown>) => env.call<AddResult<Minifigure>>(IPC.ADD_FIG, fig, opts)
const rebrickableRequests = () => env.apis.requests.filter((r) => r.service === 'rebrickable').length

beforeAll(async () => {
  env = await createTestEnv()
  await env.call(IPC.SETTINGS_SET_SECRET, 'rebrickable', VALID_KEYS.rebrickable)
})
afterAll(() => env?.close())

describe('adding sets', () => {
  it('adds a set by number with its catalog details and root theme', async () => {
    const { item, outcome } = await addSet('75192', { as: 'owned', condition: 'sealed', acquired_price: 650 })
    expect(outcome).toBe('added')
    expect(item).toMatchObject({
      set_number: '75192-1', name: 'Millennium Falcon', year: 2017, piece_count: 7541,
      image_url: 'https://cdn.rebrickable.com/media/sets/75192-1/30881.jpg',
      rebrickable_url: 'https://rebrickable.com/sets/75192-1/millennium-falcon/',
      bricklink_url: 'https://www.bricklink.com/v2/catalog/catalogitem.page?S=75192-1',
      // Rebrickable files it under "Ultimate Collector Series"; collections group by the root theme
      theme: 'Star Wars',
      is_owned: 1, is_wanted: 0, quantity: 1, condition: 'sealed', acquired_price: 650, acquired_date: today(),
    })
  })

  it('re-adding an owned set adds a copy and keeps your notes', async () => {
    const before = (await findSet('75192-1'))!
    await env.call(IPC.SET_UPDATE, before.id, { notes: 'Shelf A', has_box: 1, has_instructions: 0, missing_parts: '2 tiles', acquired_price: 600 })
    const requestsBefore = rebrickableRequests()

    const { item, outcome } = await addSet('75192-1', { as: 'owned', condition: 'open_incomplete', acquired_price: 1, notes: 'should not replace yours' })
    expect(outcome).toBe('copy')
    expect(item).toMatchObject({
      id: before.id, quantity: 2, notes: 'Shelf A', has_box: 1, has_instructions: 0, missing_parts: '2 tiles',
      acquired_price: 600, condition: 'sealed', acquired_date: before.acquired_date,
    })
    // A set already in the collection skips the catalog round trip
    expect(rebrickableRequests()).toBe(requestsBefore)
    expect((await listSets()).filter((s) => s.set_number === '75192-1')).toHaveLength(1)
  })

  it('moves a wishlist set to owned when you add it, keeping its notes', async () => {
    const wanted = await addSet('21330', { as: 'wanted', notes: 'Christmas list' })
    expect(wanted.outcome).toBe('added')
    expect(wanted.item).toMatchObject({ set_number: '21330-1', is_owned: 0, is_wanted: 1, notes: 'Christmas list' })
    expect((await listSets('owned')).map((s) => s.set_number)).not.toContain('21330-1')
    expect((await listSets('wanted')).map((s) => s.set_number)).toContain('21330-1')

    const owned = await addSet('21330', { as: 'owned', condition: 'open_complete', quantity: 1 })
    expect(owned.outcome).toBe('moved')
    expect(owned.item).toMatchObject({ is_owned: 1, is_wanted: 0, condition: 'open_complete', notes: 'Christmas list', quantity: 1 })
    expect((await listSets('wanted')).map((s) => s.set_number)).not.toContain('21330-1')
  })

  it('adding a set you already own (or want) to the wishlist changes nothing', async () => {
    const owned = await addSet('75192', { as: 'wanted' })
    expect(owned.outcome).toBe('exists')
    expect(owned.item).toMatchObject({ is_owned: 1, is_wanted: 0, quantity: 2 })

    expect((await addSet('10497', { as: 'wanted' })).outcome).toBe('added')
    const again = await addSet('10497-1', { as: 'wanted' })
    expect(again.outcome).toBe('exists')
    expect(again.item).toMatchObject({ is_owned: 0, is_wanted: 1 })
  })
})

describe('minifigures', () => {
  it('adds a Rebrickable fig that carries its BrickLink id', async () => {
    const { item, outcome } = await addFig(
      { set_num: 'fig-002514', name: 'C-3PO, Pearl Gold, Colorful Wires, Printed Legs', bricklink_id: 'sw0700', set_img_url: null },
      { as: 'owned', condition: 'new', acquired_price: 4.5 },
    )
    expect(outcome).toBe('added')
    expect(item).toMatchObject({
      fig_number: 'fig-002514', bricklink_id: 'sw0700', is_owned: 1, quantity: 1, condition: 'new', acquired_price: 4.5,
      bricklink_url: 'https://www.bricklink.com/v2/catalog/catalogitem.page?M=sw0700',
    })
  })

  it('adding the same fig by its BrickLink id adds a copy instead of a duplicate row', async () => {
    const { item, outcome } = await addFig({ set_num: 'sw0700', name: 'C-3PO - Colorful Wires, Printed Legs' }, { as: 'owned' })
    expect(outcome).toBe('copy')
    expect(item).toMatchObject({ fig_number: 'fig-002514', bricklink_id: 'sw0700', quantity: 2 })
    // The Rebrickable name is kept; the BrickLink one didn't overwrite it
    expect(item.name).toBe('C-3PO, Pearl Gold, Colorful Wires, Printed Legs')
    const rows = (await listFigs()).filter((f) => f.fig_number === 'fig-002514' || f.fig_number === 'sw0700' || f.bricklink_id === 'sw0700')
    expect(rows).toHaveLength(1)
  })

  it('a wanted BrickLink-id fig is found again by its Rebrickable number', async () => {
    expect((await addFig({ set_num: 'sw1034', name: 'BB-8' }, { as: 'wanted' })).outcome).toBe('added')
    const { item, outcome } = await addFig({ set_num: 'fig-002544', name: 'BB-8', bricklink_id: 'sw1034' }, { as: 'owned' })
    expect(outcome).toBe('moved')
    expect(item).toMatchObject({ fig_number: 'sw1034', is_owned: 1, is_wanted: 0 })
    expect((await listFigs()).filter((f) => f.fig_number === 'fig-002544' || f.bricklink_id === 'sw1034')).toHaveLength(1)
  })
})

describe('ownership index', () => {
  it('lists owned and wanted items separately; wishlist items are never "owned"', async () => {
    await addFig({ set_num: 'sh0725', name: 'Amber Grant' }, { as: 'wanted' })
    const { owned, wanted } = await env.call<OwnershipIndex>(IPC.OWNERSHIP)
    expect(owned).toEqual(expect.arrayContaining(['75192-1', '21330-1']))
    expect(wanted).toContain('10497-1')
    expect(owned).not.toContain('10497-1')
    expect(wanted).toContain('sh0725')
    expect(owned).not.toContain('sh0725')
    expect(owned.filter((n) => wanted.includes(n))).toEqual([])
  })

  it('names owned figs under both their Rebrickable and BrickLink ids', async () => {
    const { owned } = await env.call<OwnershipIndex>(IPC.OWNERSHIP)
    expect(owned).toEqual(expect.arrayContaining(['fig-002514', 'sw0700', 'sw1034']))
  })
})

describe('editing', () => {
  it('SET_UPDATE changes only the fields you are allowed to edit', async () => {
    const before = (await findSet('21330-1'))!
    const after = await env.call<LegoSet>(IPC.SET_UPDATE, before.id, {
      id: 9999,
      created_at: '1999-01-01 00:00:00',
      set_number: 'HACKED-1',
      bricklink_url: 'javascript:alert(1)',
      "name = 'pwned', notes": 'x',
      'notes = 1; DROP TABLE sets; --': 'x',
      notes: 'Mint',
    })
    expect(after).toMatchObject({ id: before.id, set_number: '21330-1', created_at: before.created_at, bricklink_url: before.bricklink_url, name: 'Home Alone', notes: 'Mint' })
    expect((await listSets()).length).toBeGreaterThan(0)
  })

  it('FIG_UPDATE changes only the fields you are allowed to edit', async () => {
    const fig = (await listFigs()).find((f) => f.fig_number === 'fig-002514')!
    const after = await env.call<Minifigure>(IPC.FIG_UPDATE, fig.id, {
      id: 1, fig_number: 'HACKED', created_at: '1999-01-01 00:00:00', image_url: 'https://evil.example/x.png',
      'condition = (SELECT 1); --': 'x', notes: 'Arms loose', condition: 'Cracked',
    })
    expect(after).toMatchObject({ id: fig.id, fig_number: 'fig-002514', created_at: fig.created_at, image_url: fig.image_url, notes: 'Arms loose', condition: 'cracked' })
  })

  it('normalizes condition and quantity values on update', async () => {
    const set = (await findSet('21330-1'))!
    expect(await env.call(IPC.SET_UPDATE, set.id, { condition: 'NEW', quantity: 0 })).toMatchObject({ condition: 'sealed', quantity: 1 })
    expect(await env.call(IPC.SET_UPDATE, set.id, { condition: 'incomplete', quantity: '3' })).toMatchObject({ condition: 'open_incomplete', quantity: 3 })
  })

  it('bulk-updates condition on many items, ignoring other fields', async () => {
    const a = (await findSet('75192-1'))!
    const b = (await findSet('21330-1'))!
    const changed = await env.call<number>(IPC.ITEMS_BULK_UPDATE, 'set', [a.id, b.id, 999_999], { condition: 'used', name: 'renamed', quantity: 50 })
    expect(changed).toBe(2)
    const [a2, b2] = [(await findSet('75192-1'))!, (await findSet('21330-1'))!]
    expect([a2.condition, b2.condition]).toEqual(['open_complete', 'open_complete'])
    expect([a2.name, a2.quantity]).toEqual(['Millennium Falcon', 2])
    // Put it back for the tests below
    await env.call(IPC.ITEMS_BULK_UPDATE, 'set', [a.id], { condition: 'sealed' })
  })
})

describe('delete and undo', () => {
  it('deleting and restoring a set brings back its fields and tags', async () => {
    const set = (await findSet('75192-1'))!
    expect(await env.call<number>(IPC.TAGS_APPLY, 'set', ['75192-1'], ['UCS', 'Display'])).toBe(2)

    const deleted = await env.call<DeletedRow[]>(IPC.ITEMS_DELETE, 'set', [set.id])
    expect(deleted).toHaveLength(1)
    expect([...deleted[0].tags].sort()).toEqual(['Display', 'UCS'])
    expect(await findSet('75192-1')).toBeUndefined()
    const tagsAfterDelete = await env.call<Tag[]>(IPC.TAGS_LIST)
    expect(tagsAfterDelete.find((t) => t.name === 'UCS')?.item_count).toBe(0)

    expect(await env.call<number>(IPC.ITEMS_RESTORE, 'set', deleted)).toBe(1)
    const restored = (await findSet('75192-1'))!
    expect(restored).toMatchObject({
      name: 'Millennium Falcon', quantity: 2, notes: 'Shelf A', has_box: 1, missing_parts: '2 tiles', acquired_price: 600,
      condition: 'sealed', created_at: set.created_at, is_owned: 1,
    })
    expect([...restored.tags].sort()).toEqual(['Display', 'UCS'])
    const tagged = await env.call<CollectionSet[]>(IPC.SETS_LIST, { scope: 'all', tag: 'UCS' })
    expect(tagged.map((s) => s.set_number)).toEqual(['75192-1'])
  })

  it('restoring a row that was re-added in the meantime does not duplicate it', async () => {
    const set = (await findSet('21330-1'))!
    const deleted = await env.call<DeletedRow[]>(IPC.ITEMS_DELETE, 'set', [set.id])
    await addSet('21330', { as: 'owned' })
    expect(await env.call<number>(IPC.ITEMS_RESTORE, 'set', deleted)).toBe(0)
    expect((await listSets()).filter((s) => s.set_number === '21330-1')).toHaveLength(1)
  })

  it('deletes and restores minifigures too', async () => {
    const fig = (await listFigs()).find((f) => f.fig_number === 'fig-002514')!
    await env.call(IPC.TAGS_APPLY, 'minifig', ['fig-002514'], ['Droids'])
    const deleted = await env.call<DeletedRow[]>(IPC.ITEMS_DELETE, 'minifig', [fig.id])
    expect((await listFigs()).find((f) => f.fig_number === 'fig-002514')).toBeUndefined()
    expect(await env.call<number>(IPC.ITEMS_RESTORE, 'minifig', deleted)).toBe(1)
    const back = (await listFigs()).find((f) => f.fig_number === 'fig-002514')!
    expect(back).toMatchObject({ bricklink_id: 'sw0700', quantity: 2, notes: 'Arms loose', condition: 'cracked' })
    expect(back.tags).toEqual(['Droids'])
  })
})

describe('catalog', () => {
  it('shows a set with its root theme and the minifigures that come in it', async () => {
    const detail = await env.call<{ set: { set_num: string }; theme: string; minifigs: { set_num: string }[] }>(IPC.CATALOG_SET_DETAIL, '75192')
    expect(detail.set.set_num).toBe('75192-1')
    expect(detail.theme).toBe('Star Wars')
    expect(detail.minifigs.map((f) => f.set_num)).toContain('fig-002544')
    expect(detail.minifigs).toHaveLength(9)
  })
})
