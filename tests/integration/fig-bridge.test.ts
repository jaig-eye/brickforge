/**
 * Finding a minifigure's BrickLink id (its key in the collection) through the
 * BrickLink inventories of the sets it comes in, with Brickognize deciding
 * only between that inventory's figures. Fixtures: real BrickLink inventories.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createTestEnv, type TestEnv } from '../helpers/env'
import { VALID_KEYS } from '../helpers/fake-apis'
import { makePng } from '../helpers/images'
import { IPC } from '../../src/lib/ipc-types'
import type { CatalogSetDetail, CollectionFig, AddResult, Minifigure } from '../../src/lib/types'

let env: TestEnv
let bridge: typeof import('../../electron/services/catalog')
const figs = () => env.call<CollectionFig[]>(IPC.FIGS_LIST, { scope: 'all' })
const blKeys = () => env.call(IPC.SETTINGS_SET_SECRET, 'bricklink', {
  bricklinkConsumerKey: VALID_KEYS.bricklinkConsumer, bricklinkConsumerSecret: 'cs', bricklinkToken: 'tk', bricklinkTokenSecret: 'ts',
})

beforeAll(async () => {
  env = await createTestEnv()
  await env.call(IPC.SETTINGS_SET_SECRET, 'rebrickable', VALID_KEYS.rebrickable)
  bridge = await import('../../electron/services/catalog')
})
afterAll(() => env.close())

describe('without BrickLink keys', () => {
  it("a set's minifigures come from Rebrickable, under Rebrickable numbers", async () => {
    const d = await env.call<CatalogSetDetail>(IPC.CATALOG_SET_DETAIL, '10497-1')
    expect(d.minifigs.map((f) => f.set_num).every((n) => n.startsWith('fig-'))).toBe(true)
    expect(d.minifigs.some((f) => f.bricklink_id)).toBe(false)
  })

  it('a fig BrickLink can\'t place stays under its Rebrickable number', async () => {
    const r = await env.call<AddResult<Minifigure>>(IPC.ADD_FIG, { set_num: 'fig-011862', name: 'Harry Lime', set_img_url: null }, { as: 'owned' })
    expect(r.item).toMatchObject({ fig_number: 'fig-011862', rebrickable_id: 'fig-011862', bricklink_id: null })
  })
})

describe('with BrickLink keys', () => {
  beforeAll(async () => { await blKeys() })

  it("a set's minifigures come from its BrickLink inventory, with their BrickLink ids and counts", async () => {
    const d = await env.call<CatalogSetDetail>(IPC.CATALOG_SET_DETAIL, '10497-1')
    expect(d.minifigs.map((f) => [f.bricklink_id, f.quantity])).toEqual([['tlm110', 2], ['sp132', 2], ['sp133', 1]])
    // BrickLink's escaped names arrive as plain text
    expect(d.minifigs[1].set_name).toBe('Classic Space - Red with Air Tanks and Updated Helmet (Second Reissue)')
  })

  it('adding one of those figures keys it by its BrickLink id from the start', async () => {
    const d = await env.call<CatalogSetDetail>(IPC.CATALOG_SET_DETAIL, '10497-1')
    const f = d.minifigs[2]
    const r = await env.call<AddResult<Minifigure>>(IPC.ADD_FIG, { set_num: f.set_num, name: f.set_name, set_img_url: f.set_img_url, bricklink_id: f.bricklink_id }, { as: 'owned', quantity: f.quantity })
    expect(r.item).toMatchObject({ fig_number: 'sp133', bricklink_id: 'sp133', rebrickable_id: null, quantity: 1 })
  })

  it('a fig whose sets share exactly one minifigure is that one', async () => {
    // C-3PO is in four sets; across their inventories only sw0700 is in all four
    expect(await bridge.ensureFigBricklinkId('fig-002514')).toBe('sw0700')
  })

  it('among several figures in a set, the name decides when one clearly fits', async () => {
    expect(await bridge.ensureFigBricklinkId('fig-011864')).toBe('idea100') // Kate McCallister, one of five in 21330-1
    expect(await bridge.ensureFigBricklinkId('fig-013153')).toBe('sw1244') // "Kuill" is BrickLink's "Kuiil"
  })

  it('figures from a set with look-alikes resolve by their distinctive words (the Clone Commander search)', async () => {
    expect(await bridge.ensureFigBricklinkId('fig-003867')).toBe('sw0377') // "… (Commander Hammer)" is the Rancor Battalion's Hammer
    expect(await bridge.ensureFigBricklinkId('fig-004032')).toBe('sw0524') // a BARC trooper, among droids
  })

  it("when names can't tell them apart, Brickognize picks, but only from the set's figures", async () => {
    // "Classic Spaceman, Red with Airtanks (New Moulds)": 10497-1 has a red and a white spaceman
    const img = `${env.apis.urls.rebrickable}/img/fig-012910.png`
    const undo = [
      env.apis.override((req) => (req.service === 'rebrickable' && req.path === '/img/fig-012910.png' ? { body: makePng(7, 64) } : undefined)),
      env.apis.override((req) => (req.service === 'rebrickable' && req.path === '/minifigs/fig-012910/'
        ? { json: { set_num: 'fig-012910', name: 'Classic Spaceman, Red with Airtanks (New Moulds)', num_parts: 4, set_img_url: img } }
        : undefined)),
      env.apis.override((req) => (req.service === 'brickognize' && req.path === '/predict/figs/'
        ? { json: { listing_id: 'x', items: [
            { id: 'sw9999', name: 'Something else entirely', img_url: null, type: 'fig', category: null, score: 0.97, external_sites: [] },
            { id: 'sp132', name: 'Classic Space - Red', img_url: null, type: 'fig', category: null, score: 0.41, external_sites: [] },
          ] } }
        : undefined)),
    ]
    try {
      expect(await bridge.ensureFigBricklinkId('fig-012910')).toBe('sp132')
    } finally {
      undo.forEach((u) => u())
    }
  })

  it('search results get BrickLink ids: known ones at once, the rest announced as they are found, then remembered', async () => {
    const results = [
      { id: 'fig-002514', name: 'C-3PO, Pearl Gold, Colorful Wires, Printed Legs' }, // matched earlier in this file
      { id: 'fig-011300', name: 'Aunt May, Light Bluish Gray Sweater' },
    ]
    const before = env.pushes(IPC.PUSH_FIG_IDS).length
    const first = await env.call<Record<string, string | null>>(IPC.CATALOG_FIG_IDS, results)
    expect(first).toEqual({ 'fig-002514': 'sw0700' })
    await vi.waitFor(() => expect(env.pushes(IPC.PUSH_FIG_IDS).slice(before)).toContainEqual({ rebrickable_id: 'fig-011300', bricklink_id: 'sh0721' }))
    expect(await env.call(IPC.CATALOG_FIG_IDS, results)).toEqual({ 'fig-002514': 'sw0700', 'fig-011300': 'sh0721' })
  })

  it('a remembered "no match" stands for a week, but only under the matching rules that found it', async () => {
    const { getDb } = await import('../../electron/db/index')
    const { FIG_MATCH_RULE, rememberedFigIds } = await import('../../electron/db/queries/collection.queries')
    const miss = (rule: number, ago = '0 days') => getDb().prepare(
      "INSERT OR REPLACE INTO fig_id_map (rebrickable_id, bricklink_id, checked_at, rule) VALUES ('fig-003867', NULL, datetime('now', ?), ?)",
    ).run(`-${ago}`, rule)
    miss(FIG_MATCH_RULE)
    expect(rememberedFigIds(['fig-003867'])).toEqual({ 'fig-003867': null })
    miss(FIG_MATCH_RULE, '8 days')
    expect(rememberedFigIds(['fig-003867'])).toEqual({})
    miss(FIG_MATCH_RULE - 1)
    expect(rememberedFigIds(['fig-003867'])).toEqual({})
    // ...so the lookup tries again and finds it
    expect(await bridge.ensureFigBricklinkId('fig-003867')).toBe('sw0377')
  })

  it('a throttled lookup is an error, not a remembered "no match"', async () => {
    const { rememberedFigIds } = await import('../../electron/db/queries/collection.queries')
    const undo = env.apis.override((req) => (req.service === 'rebrickable' && req.path === '/minifigs/fig-012980/sets/'
      ? { status: 429, json: { detail: 'Request was throttled.' } }
      : undefined))
    try {
      await expect(bridge.ensureFigBricklinkId('fig-012980')).rejects.toMatchObject({ code: 'rate_limited' })
    } finally {
      undo()
    }
    expect(rememberedFigIds(['fig-012980'])).toEqual({})
    // Once Rebrickable answers again, it finds it (Castle Woman, among a set of 22)
    expect(await bridge.ensureFigBricklinkId('fig-012980')).toBe('cas570')
  })

  it('refreshing the price of an unmatched fig matches it, moves it, and prices it under its BrickLink id', async () => {
    const price = await env.call<number | null>(IPC.PRICE_REFRESH_ITEM, 'minifig', 'fig-011862')
    expect(price).toBeGreaterThan(0)
    const harry = (await figs()).find((f) => f.rebrickable_id === 'fig-011862')
    expect(harry).toMatchObject({ fig_number: 'idea101', bricklink_id: 'idea101', market_price: price })
    expect((await figs()).find((f) => f.fig_number === 'fig-011862')).toBeUndefined()
  })
})
