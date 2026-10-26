/**
 * Selling (eBay listing writer + price suggestion) and importing/exporting
 * the collection.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv, type TestEnv } from '../helpers/env'
import { VALID_KEYS } from '../helpers/fake-apis'
import { answerWhen, isAnthropicCall, promptOf } from '../helpers/ai'
import { IPC } from '../../src/lib/ipc-types'
import type {
  CollectionFig, CollectionSet, ImportItem, ImportProgress, ImportResult, ListingHistoryEntry, ListingResult, PriceSuggestion,
} from '../../src/lib/types'
import { collectionCsv, parseCollectionFile } from '../../electron/services/importer'

let env: TestEnv
const PREFS = { completeness: 'complete', includes_instructions: true, includes_figures: true, includes_box: false, smoke_free_home: true, clean_set: false, seller_notes: null }
const DANGLING = /(\s(\||&|w\/|with|and|-|·)|,)$/i

const listSets = () => env.call<CollectionSet[]>(IPC.SETS_LIST, { scope: 'all' })
const listFigs = () => env.call<CollectionFig[]>(IPC.FIGS_LIST, { scope: 'all' })
const setRow = async (num: string) => (await listSets()).find((s) => s.set_number === num)
const figRow = async (num: string) => (await listFigs()).find((f) => f.fig_number === num)

beforeAll(async () => {
  env = await createTestEnv()
  await env.call(IPC.SETTINGS_SET_SECRET, 'rebrickable', VALID_KEYS.rebrickable)
  await env.call(IPC.SETTINGS_SET_SECRET, 'anthropic', VALID_KEYS.anthropic)
})
afterAll(() => env?.close())

describe('listing writer', () => {
  it('writes a title that fits eBay and a description with the dangerous parts removed', async () => {
    const res = await env.call<ListingResult>(IPC.SELL_GENERATE, '75192', PREFS)
    expect(res.title.length).toBeLessThanOrEqual(80)
    expect(res.title).not.toMatch(DANGLING)
    expect(res.title).toBe('LEGO Millennium Falcon 75192 | Complete w/ Manual & Minifigs Extra Long Title')
    // The stand-in AI deliberately returns a script, an onclick, and an <img onerror>
    expect(res.description).toBe('<div style="background:#111"><h2 style="color:#fff">Millennium Falcon</h2><p>Great set.</p></div>')
    expect(res.description).not.toMatch(/script|onclick|onerror|<img/i)

    const prompt = promptOf(env.apis.requests.filter(isAnthropicCall).at(-1)!)
    expect(prompt).toContain('Theme      : Star Wars')
    expect(prompt).toContain('Minifigs   : 10') // nine figures, two of them Porgs
  })

  it('saves what it wrote to the history with a stable uid', async () => {
    const [entry] = await env.call<ListingHistoryEntry[]>(IPC.SELL_HISTORY)
    expect(entry).toMatchObject({
      set_number: '75192-1', set_name: 'Millennium Falcon', year: 2017, provider: 'anthropic:claude-opus-5-5',
      title: 'LEGO Millennium Falcon 75192 | Complete w/ Manual & Minifigs Extra Long Title',
    })
    expect(entry.description).not.toContain('<script')
    expect(entry.uid).toMatch(/^[0-9a-f]{32}$/)
  })

  it('trims the real "… | 99% Complete w/" title the AI once produced', async () => {
    const undo = env.apis.override(answerWhen((p) => p.includes('eBay listing'), JSON.stringify({
      title: 'LEGO Star Wars Ultimate Collector Series Razor Crest 75331 | 99% Complete w/ Manual',
      description: '<p>Nice</p>',
    })))
    try {
      const res = await env.call<ListingResult>(IPC.SELL_GENERATE, '75331-1', { ...PREFS, completeness: 'partial' })
      expect(res.title).toBe('LEGO Star Wars Ultimate Collector Series Razor Crest 75331 | 99% Complete')
    } finally {
      undo()
    }
  })

  it('an answer missing the title or description is an error, and nothing is saved', async () => {
    const before = (await env.call<ListingHistoryEntry[]>(IPC.SELL_HISTORY)).length
    const undo = env.apis.override(answerWhen((p) => p.includes('eBay listing'), '{"title": "LEGO Titanic 10294", "description": ""}'))
    try {
      expect(await env.invoke(IPC.SELL_GENERATE, '10294', PREFS)).toMatchObject({ ok: false, error: { code: 'service' } })
    } finally {
      undo()
    }
    expect(await env.call<ListingHistoryEntry[]>(IPC.SELL_HISTORY)).toHaveLength(before)
  })

  it('uses the current default when the stored Claude model is retired', async () => {
    await env.call(IPC.SETTINGS_SET_AI, 'anthropic', 'claude-haiku-4-5-20251001')
    await env.call(IPC.SELL_GENERATE, '10497', PREFS)
    const body = JSON.parse(env.apis.requests.filter(isAnthropicCall).at(-1)!.body.toString()) as { model: string }
    expect(body.model).toBe('claude-opus-5-5')
    const [latest] = await env.call<ListingHistoryEntry[]>(IPC.SELL_HISTORY)
    expect(latest.provider).toBe('anthropic:claude-opus-5-5')
  })

  it('deletes a listing from the history', async () => {
    const [latest] = await env.call<ListingHistoryEntry[]>(IPC.SELL_HISTORY)
    await env.call(IPC.SELL_DELETE, latest.id)
    expect((await env.call<ListingHistoryEntry[]>(IPC.SELL_HISTORY)).map((l) => l.id)).not.toContain(latest.id)
  })
})

describe('price suggestion', () => {
  it('needs BrickLink keys', async () => {
    expect(await env.invoke(IPC.SELL_PRICE, '75192', 'new')).toMatchObject({ ok: false, error: { code: 'missing_key', service: 'bricklink' } })
  })

  it('maps BrickLink sold data for the condition asked', async () => {
    await env.call(IPC.SETTINGS_SET_SECRET, 'bricklink', {
      bricklinkConsumerKey: VALID_KEYS.bricklinkConsumer, bricklinkConsumerSecret: 'cs', bricklinkToken: 'tk', bricklinkTokenSecret: 'ts',
    })
    expect(await env.call<PriceSuggestion>(IPC.SELL_PRICE, '75192', 'new')).toEqual({ condition: 'new', avg: 701.94, min: 483, max: 1999, samples: 22, source: 'sold' })
    expect(await env.call<PriceSuggestion>(IPC.SELL_PRICE, '75192-1', 'used')).toEqual({ condition: 'used', avg: 559.24, min: 408.2, max: 650, samples: 18, source: 'sold' })
    expect(await env.call(IPC.SELL_PRICE, '60380', 'used')).toBeNull()
  })
})

describe('import', () => {
  const FILE: ImportItem[] = [
    { kind: 'set', number: '75192', quantity: 2, wanted: false, condition: 'new', price: 650, notes: 'Still in shrink wrap' },
    { kind: 'set', number: '10497-1', quantity: 3, wanted: false, condition: 'open_incomplete', price: 90, notes: 'Missing 2 tiles' },
    { kind: 'set', number: '21330', quantity: 1, wanted: true },
    { kind: 'set', number: '99999', quantity: 1, wanted: false },
    { kind: 'minifig', number: 'fig-002544', quantity: 2, wanted: false, condition: 'new' },
    { kind: 'minifig', number: 'sw1034', quantity: 1, wanted: true },
    { kind: 'minifig', number: 'sh0725', quantity: 1, wanted: false, condition: 'used', price: 2.5 },
    { kind: 'minifig', number: 'fig-999999', quantity: 1, wanted: false },
  ]

  it('adds new items from the catalog, updates ones you have, and reports the rest', async () => {
    await env.call(IPC.ADD_SET, '10497', { as: 'owned', condition: 'sealed' })
    const pushesBefore = env.pushes(IPC.PUSH_IMPORT).length

    const result = await env.call<ImportResult>(IPC.DATA_IMPORT_RUN, FILE, 'owned')
    expect(result.imported).toBe(5)
    expect(result.updated).toBe(1)
    expect(result.failed.map((f) => f.number).sort()).toEqual(['99999', 'fig-999999'])
    expect(result.failed.find((f) => f.number === '99999')?.reason).toMatch(/isn't in the Rebrickable catalog/)

    expect(await setRow('75192-1')).toMatchObject({
      name: 'Millennium Falcon', theme: 'Star Wars', is_owned: 1, is_wanted: 0, quantity: 2, condition: 'sealed', acquired_price: 650, notes: 'Still in shrink wrap',
    })
    // An existing set takes the file's condition, price, and notes (the review path used to drop them)
    expect(await setRow('10497-1')).toMatchObject({ is_owned: 1, quantity: 3, condition: 'open_incomplete', acquired_price: 90, notes: 'Missing 2 tiles' })
    expect(await setRow('21330-1')).toMatchObject({ is_owned: 0, is_wanted: 1 })
    expect(await figRow('fig-002544')).toMatchObject({ name: 'BB-8', is_owned: 1, quantity: 2, condition: 'new' })
    expect(await figRow('sw1034')).toMatchObject({ is_owned: 0, is_wanted: 1 })
    expect(await figRow('sh0725')).toMatchObject({ is_owned: 1, acquired_price: 2.5 })

    const progress = env.pushes(IPC.PUSH_IMPORT).slice(pushesBefore) as ImportProgress[]
    expect(progress[0]).toEqual({ done: 0, total: FILE.length, current: '75192' })
    expect(progress.at(-1)).toEqual({ done: FILE.length, total: FILE.length, current: null })
    expect(progress).toHaveLength(FILE.length + 1)

    // Let the background catalog fill-in finish before the next test
    await env.call(IPC.DATA_ENRICH)
  })

  it('names minifigs imported by BrickLink id from BrickLink, without HTML entities', async () => {
    expect(await figRow('sh0725')).toMatchObject({ name: 'Amber Grant', year: 2021 })
    expect((await figRow('sw1034'))?.name).toBe('BB-8 (Large Photoreceptor and Large Black Circle)')
  })

  it('importing the same items again updates them and never duplicates', async () => {
    const again = await env.call<ImportResult>(IPC.DATA_IMPORT_RUN, [
      { kind: 'set', number: '75192-1', quantity: 1, wanted: false, condition: 'open_complete', price: 600, notes: 'Opened for display' },
      { kind: 'minifig', number: 'fig-002544', quantity: 1, wanted: false },
      // A wishlist row for a set you own doesn't take it off your shelf
      { kind: 'set', number: '10497', quantity: 3, wanted: true },
    ], 'owned')
    expect(again).toEqual({ imported: 0, updated: 3, failed: [] })
    const sets = await listSets()
    expect(sets.filter((s) => s.set_number === '75192-1')).toHaveLength(1)
    expect(await setRow('75192-1')).toMatchObject({ quantity: 1, condition: 'open_complete', acquired_price: 600, notes: 'Opened for display' })
    expect(await setRow('10497-1')).toMatchObject({ is_owned: 1, is_wanted: 0 })
    expect((await listFigs()).filter((f) => f.fig_number === 'fig-002544')).toHaveLength(1)
    await env.call(IPC.DATA_ENRICH)
  })

  it('imports everything as wishlist items when asked', async () => {
    const res = await env.call<ImportResult>(IPC.DATA_IMPORT_RUN, [{ kind: 'set', number: '10281', quantity: 1, wanted: false }], 'wanted')
    expect(res.imported).toBe(1)
    expect(await setRow('10281-1')).toMatchObject({ is_owned: 0, is_wanted: 1 })
    await env.call(IPC.DATA_ENRICH)
  })

  it('runs one import at a time', async () => {
    const first = env.invoke<ImportResult>(IPC.DATA_IMPORT_RUN, [{ kind: 'set', number: '21318', quantity: 1, wanted: false }], 'owned')
    const second = await env.invoke(IPC.DATA_IMPORT_RUN, [{ kind: 'set', number: '10294', quantity: 1, wanted: false }], 'owned')
    expect(second).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
    expect(await first).toMatchObject({ ok: true, data: { imported: 1 } })
    await env.call(IPC.DATA_ENRICH)
  })

  it('an export imports back into an empty collection with the same wishlist, quantities, and your fields', async () => {
    const userFields = async () => ({
      sets: Object.fromEntries((await listSets()).map((s) => [s.set_number, {
        q: s.quantity, owned: s.is_owned, wanted: s.is_wanted, c: s.condition, paid: s.acquired_price, notes: s.notes,
        date: s.acquired_date, box: s.has_box, manual: s.has_instructions, missing: s.missing_parts, tags: [...s.tags].sort(),
      }])),
      figs: Object.fromEntries((await listFigs()).map((f) => [f.fig_number, {
        q: f.quantity, owned: f.is_owned, wanted: f.is_wanted, c: f.condition, paid: f.acquired_price, notes: f.notes,
        date: f.acquired_date, bl: f.bricklink_id, tags: [...f.tags].sort(),
      }])),
    })
    // The details only a BrickForge export carries come back too
    const falcon = await setRow('75192-1')
    await env.call(IPC.SET_UPDATE, falcon!.id, { acquired_date: '2025-12-24', has_box: 1, has_instructions: 0, missing_parts: '2x 3023 light grey' })
    await env.call(IPC.TAGS_APPLY, 'set', ['75192-1', '10497-1'], ['UCS', 'Display; shelf 2'])
    // ";" separates tags in the export, so a tag can't contain one
    expect((await listSets()).find((x) => x.set_number === '75192-1')?.tags).toContain('Display, shelf 2')
    await env.call(IPC.TAGS_APPLY, 'minifig', ['sh0725'], ['Marvel'])
    const bb8 = await figRow('fig-002544')
    await env.call(IPC.FIG_UPDATE, bb8!.id, { bricklink_id: 'sw0662', acquired_date: '2024-05-04' })
    const before = await userFields()
    expect(Object.values(before.sets).some((s) => s.wanted)).toBe(true)
    expect(before.sets['75192-1']).toMatchObject({ date: '2025-12-24', box: 1, manual: 0, missing: '2x 3023 light grey' })
    expect(before.figs['fig-002544']).toMatchObject({ bl: 'sw0662', date: '2024-05-04' })

    const { csv, sets, figs } = collectionCsv()
    expect([sets, figs]).toEqual([Object.keys(before.sets).length, Object.keys(before.figs).length])
    const parsed = parseCollectionFile(csv)
    expect(parsed.format).toBe('BrickForge CSV')

    await env.call(IPC.ITEMS_DELETE, 'set', (await listSets()).map((s) => s.id))
    await env.call(IPC.ITEMS_DELETE, 'minifig', (await listFigs()).map((f) => f.id))
    expect(await listSets()).toEqual([])

    const res = await env.call<ImportResult>(IPC.DATA_IMPORT_RUN, parsed.items, 'owned')
    expect(res).toMatchObject({ failed: [], imported: parsed.items.length })
    expect(await userFields()).toEqual(before)
    await env.call(IPC.DATA_ENRICH)
  })
})
