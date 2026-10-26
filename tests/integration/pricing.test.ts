/**
 * Prices, valuation, and alerts. The valuation tests seed exact price
 * history through the real recordPrice(); the refresh tests then price the
 * collection from the recorded BrickLink fixtures through the fake server.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv, type TestEnv } from '../helpers/env'
import { VALID_KEYS } from '../helpers/fake-apis'
import { IPC } from '../../src/lib/ipc-types'
import type {
  AddResult, CollectionSet, LegoSet, Minifigure, Mover, PortfolioHistoryPoint, PortfolioSummary, PriceAlert, PublicSettings,
  RefreshStatus, TriggeredAlert,
} from '../../src/lib/types'
import { getDb } from '../../electron/db/index'
import { recordPrice, type PriceRecord } from '../../electron/db/queries/pricing.queries'

let env: TestEnv
const BRICKLINK = {
  bricklinkConsumerKey: VALID_KEYS.bricklinkConsumer, bricklinkConsumerSecret: 'cs', bricklinkToken: 'tk', bricklinkTokenSecret: 'ts',
}

/** A date relative to SQLite's "today" (UTC), the clock price history uses. */
const day = (daysAgo: number) => (getDb().prepare('SELECT date(\'now\', ?) AS d').get(`-${daysAgo} days`) as { d: string }).d
const seed = (entity_type: 'set' | 'minifig', entity_id: string, condition: 'new' | 'used', avg_price: number, daysAgo: number) =>
  recordPrice({ entity_type, entity_id, condition, avg_price, source: 'sold', min_price: null, max_price: null, sample_count: 5 } satisfies PriceRecord, day(daysAgo))
const rowsFor = (id: string) => getDb().prepare('SELECT * FROM price_history WHERE entity_id = ? ORDER BY day, condition').all(id) as { condition: string; day: string; avg_price: number; source: string }[]
const findSet = async (num: string) => (await env.call<CollectionSet[]>(IPC.SETS_LIST, { scope: 'all' })).find((s) => s.set_number === num)!

async function refreshAndWait(): Promise<RefreshStatus> {
  const started = await env.call<RefreshStatus>(IPC.PRICE_REFRESH)
  expect(started.running).toBe(true)
  const deadline = Date.now() + 15_000
  for (;;) {
    const s = await env.call<RefreshStatus>(IPC.PRICE_REFRESH_STATUS)
    if (!s.running) return s
    if (Date.now() > deadline) throw new Error('price refresh did not finish')
    await new Promise((r) => setTimeout(r, 50))
  }
}

beforeAll(async () => { env = await createTestEnv() })
afterAll(() => env?.close())

it('PRICE_REFRESH without BrickLink keys says the keys are missing', async () => {
  const res = await env.invoke(IPC.PRICE_REFRESH)
  expect(res).toMatchObject({ ok: false, error: { code: 'missing_key', service: 'bricklink' } })
  expect((await env.call<RefreshStatus>(IPC.PRICE_REFRESH_STATUS)).running).toBe(false)
})

describe('valuation', () => {
  beforeAll(async () => {
    await env.call(IPC.SETTINGS_SET_SECRET, 'rebrickable', VALID_KEYS.rebrickable)
    await env.call(IPC.SETTINGS_SET_SECRET, 'bricklink', BRICKLINK)
    // A: opened, paid $100. B: sealed, no purchase price. F: three used figs, no purchase price. W: wishlist.
    await env.call<AddResult<LegoSet>>(IPC.ADD_SET, '10497', { as: 'owned', condition: 'open_complete', acquired_price: 100 })
    await env.call<AddResult<LegoSet>>(IPC.ADD_SET, '21330', { as: 'owned', condition: 'sealed' })
    await env.call<AddResult<Minifigure>>(IPC.ADD_FIG, { set_num: 'sw0700', name: 'C-3PO' }, { as: 'owned', condition: 'used', quantity: 3 })
    await env.call<AddResult<LegoSet>>(IPC.ADD_SET, '75192', { as: 'wanted' })

    seed('set', '10497-1', 'used', 110, 10)
    seed('set', '10497-1', 'used', 120, 5)
    seed('set', '10497-1', 'used', 122.8, 0)
    seed('set', '10497-1', 'new', 999, 0) // wrong condition for an opened set
    seed('set', '21330-1', 'new', 107.2, 5) // first priced mid-window
    seed('set', '21330-1', 'used', 1, 0) // wrong condition for a sealed set
    seed('minifig', 'sw0700', 'used', 3, 40) // before the window
    seed('minifig', 'sw0700', 'used', 4, 0)
    seed('set', '75192-1', 'new', 700, 0) // wanted: never counted as value
  })

  it('values sealed sets at "new", everything else at "used", times quantity', async () => {
    const s = await env.call<PortfolioSummary>(IPC.PRICE_SUMMARY)
    expect(s).toMatchObject({
      set_value: 230, // 122.80 (A, used) + 107.20 (B, new)
      fig_value: 12, // 3 × 4.00
      total_value: 242,
      sets_owned: 2, figs_owned: 3, priced_items: 3, unpriced_items: 0, wanted_count: 1,
      last_priced_at: `${day(0)} 12:00:00`,
    })
  })

  it('measures gain only over items with both a purchase price and a market price', async () => {
    const s = await env.call<PortfolioSummary>(IPC.PRICE_SUMMARY)
    // Counting unpaid items as pure profit would have said (242 − 100) / 100 = +142%
    expect(s).toMatchObject({ cost_basis: 100, gain: 22.8, gain_pct: 22.8, gain_items: 1 })
  })

  it('shows the same rule in the collection list', async () => {
    expect((await findSet('10497-1')).market_price).toBe(122.8)
    expect((await findSet('21330-1')).market_price).toBe(107.2)
  })

  it('portfolio history forward-fills and back-fills prices', async () => {
    const history = await env.call<PortfolioHistoryPoint[]>(IPC.PRICE_PORTFOLIO, 30)
    expect(history).toEqual([
      // The line opens at the start of the window with the prices known then.
      // B is first priced 5 days ago; it counts at that price before then. F uses its price from before the window.
      { day: day(30), set_value: 217.2, fig_value: 9, total: 226.2 },
      { day: day(10), set_value: 217.2, fig_value: 9, total: 226.2 },
      { day: day(5), set_value: 227.2, fig_value: 9, total: 236.2 },
      // B has no price today; its last one carries forward
      { day: day(0), set_value: 230, fig_value: 12, total: 242 },
    ])
  })

  it('lists the biggest movers against the start of the window', async () => {
    const movers = await env.call<Mover[]>(IPC.PRICE_MOVERS, 30, 8)
    expect(movers).toEqual([
      expect.objectContaining({ entity_type: 'set', entity_id: '10497-1', name: 'Galaxy Explorer', condition: 'used', latest: 122.8, previous: 110, delta: 12.8, pct: 11.6, since: day(10) }),
      expect.objectContaining({ entity_type: 'minifig', entity_id: 'sw0700', condition: 'used', latest: 4, previous: 3, delta: 1, pct: 33.3, since: day(40) }),
    ])
    expect(await env.call<Mover[]>(IPC.PRICE_MOVERS, 30, 1)).toHaveLength(1)
  })

  it('multiplies by quantity, gain included', async () => {
    const a = await findSet('10497-1')
    await env.call(IPC.SET_UPDATE, a.id, { quantity: 2 })
    const s = await env.call<PortfolioSummary>(IPC.PRICE_SUMMARY)
    expect(s).toMatchObject({ set_value: 352.8, total_value: 364.8, cost_basis: 200, gain: 45.6, gain_pct: 22.8, sets_owned: 3 })
    await env.call(IPC.SET_UPDATE, a.id, { quantity: 1 })
  })
})

describe('refresh', () => {
  it('prices owned, wanted, and alerted items, reporting progress as it goes', async () => {
    await env.call(IPC.ALERT_SET, { entity_type: 'set', entity_id: '76178-1', condition: 'used', direction: 'below', target_price: 100 })
    const pushesBefore = env.pushes(IPC.PUSH_REFRESH).length
    const blBefore = env.apis.requests.filter((r) => r.service === 'bricklink').length

    const status = await refreshAndWait()
    expect(status).toMatchObject({ running: false, total: 5, done: 5, refreshed: 5, failed: 0, errors: [], reason: 'manual' })

    const today = day(0)
    const latest = (id: string, condition: string) => rowsFor(id).find((r) => r.day === today && r.condition === condition)?.avg_price
    expect(latest('10497-1', 'used')).toBe(84.27) // owned, opened
    expect(latest('21330-1', 'new')).toBe(266.88) // owned, sealed
    expect(latest('sw0700', 'used')).toBe(3.64) // owned fig, by its BrickLink id
    expect(latest('75192-1', 'new')).toBe(701.94) // wanted
    expect(latest('76178-1', 'used')).toBe(365.22) // only alerted

    const pushes = env.pushes(IPC.PUSH_REFRESH).slice(pushesBefore) as RefreshStatus[]
    expect(pushes[0]).toMatchObject({ running: true, done: 0, total: 5 })
    expect(pushes.map((p) => p.done)).toEqual([...pushes.map((p) => p.done)].sort((x, y) => x - y))
    expect(pushes.some((p) => p.current === 'Galaxy Explorer')).toBe(true)
    expect(pushes.at(-1)).toMatchObject({ running: false, refreshed: 5 })

    const signed = env.apis.requests.filter((r) => r.service === 'bricklink').slice(blBefore)
    expect(signed).toHaveLength(5)
    for (const r of signed) {
      expect(String(r.headers.authorization)).toMatch(/^OAuth .*oauth_signature="[^"]+"/)
      expect(r.query.get('guide_type')).toBe('sold')
    }
    expect((await env.call<PublicSettings>(IPC.SETTINGS_GET)).lastPriceRefreshAt).toBeTruthy()
  })

  it('refreshing twice in a day keeps one row per item, condition, and day', async () => {
    await refreshAndWait()
    const dupes = getDb().prepare(`
      SELECT entity_type, entity_id, condition, day, COUNT(*) AS n FROM price_history
      GROUP BY entity_type, entity_id, condition, day HAVING n > 1
    `).all()
    expect(dupes).toEqual([])
    expect(rowsFor('10497-1').filter((r) => r.day === day(0) && r.condition === 'used')).toHaveLength(1)
  })

  it('falls back to the cheapest current listing when nothing sold', async () => {
    const undo = env.apis.override((req) => {
      if (req.service !== 'bricklink' || req.path !== '/items/SET/10497-1/price') return undefined
      const zero = { avg_price: '0.0000', min_price: '0.0000', max_price: '0.0000', qty_avg_price: '0.0000', total_quantity: 0, unit_quantity: 0 }
      const data = req.query.get('guide_type') === 'stock'
        ? { ...zero, avg_price: '95.0000', min_price: '79.5000', max_price: '120.0000', total_quantity: 9, unit_quantity: 6 }
        : zero
      return { json: { meta: { code: 200, message: 'OK' }, data } }
    })
    try {
      expect(await env.call<number | null>(IPC.PRICE_REFRESH_ITEM, 'set', '10497-1')).toBe(79.5)
    } finally {
      undo()
    }
    const set = await findSet('10497-1')
    expect(set).toMatchObject({ market_price: 79.5, market_source: 'stock' })
    expect(await env.call(IPC.PRICE_LATEST, 'set', ['10497-1'])).toMatchObject({ '10497-1': { used: 79.5, new: 999 } })
  })

  it('counts an item BrickLink has no sales or listings for as failed', async () => {
    await env.call(IPC.ADD_SET, '60380', { as: 'owned', condition: 'open_complete' })
    expect(await env.call(IPC.PRICE_REFRESH_ITEM, 'set', '60380-1')).toBeNull()
    const status = await refreshAndWait()
    expect(status).toMatchObject({ total: 6, refreshed: 5, failed: 1 })
    expect(status.errors).toEqual([expect.objectContaining({ id: '60380-1', message: expect.stringContaining('no sales or listings') })])
  })
})

describe('alerts', () => {
  const alerts = () => env.call<PriceAlert[]>(IPC.ALERTS_LIST)
  const fired = (from: number) => (env.pushes(IPC.PUSH_ALERTS).slice(from) as TriggeredAlert[][]).flat()

  it('fires a "below" alert once when the price is at or under the target', async () => {
    // 10497-1 used is at 84.27 after the last refresh
    const from = env.pushes(IPC.PUSH_ALERTS).length
    const alert = await env.call<PriceAlert>(IPC.ALERT_SET, { entity_type: 'set', entity_id: '10497-1', condition: 'used', direction: 'below', target_price: 90 })
    expect(alert).toMatchObject({ entity_id: '10497-1', direction: 'below', target_price: 90, is_active: 1 })
    expect(fired(from)).toEqual([expect.objectContaining({ id: alert.id, entity_id: '10497-1', current_price: 84.27, name: 'Galaxy Explorer' })])
    expect((await alerts()).find((a) => a.id === alert.id)?.triggered_at).toBeTruthy()

    const again = env.pushes(IPC.PUSH_ALERTS).length
    await env.call(IPC.PRICE_REFRESH_ITEM, 'set', '10497-1')
    expect(fired(again).filter((a) => a.id === alert.id)).toEqual([])
  })

  it('fires again after it is re-armed', async () => {
    const alert = (await alerts()).find((a) => a.entity_id === '10497-1')!
    const from = env.pushes(IPC.PUSH_ALERTS).length
    await env.call(IPC.ALERT_REARM, alert.id)
    expect(fired(from).map((a) => a.id)).toEqual([alert.id])
  })

  it('fires an "above" alert only once the price reaches the target', async () => {
    const from = env.pushes(IPC.PUSH_ALERTS).length
    const high = await env.call<PriceAlert>(IPC.ALERT_SET, { entity_type: 'set', entity_id: '75192-1', condition: 'new', direction: 'above', target_price: 800 })
    expect(fired(from)).toEqual([])
    const reached = await env.call<PriceAlert>(IPC.ALERT_SET, { entity_type: 'set', entity_id: '75192-1', condition: 'new', direction: 'above', target_price: 700 })
    expect(reached.id).toBe(high.id) // one alert per item, condition and direction
    expect(fired(from)).toEqual([expect.objectContaining({ id: high.id, direction: 'above', current_price: 701.94 })])
  })

  it('does not fire for an item still above a "below" target', async () => {
    const watched = (await alerts()).find((a) => a.entity_id === '76178-1')!
    expect(watched).toMatchObject({ current_price: 365.22, triggered_at: null })
  })

  it('refuses a target that is not above $0, and deletes alerts', async () => {
    expect(await env.invoke(IPC.ALERT_SET, { entity_type: 'set', entity_id: '10497-1', condition: 'used', direction: 'below', target_price: 0 })).toMatchObject({ ok: false })
    const watched = (await alerts()).find((a) => a.entity_id === '76178-1')!
    await env.call(IPC.ALERT_DELETE, watched.id)
    expect((await alerts()).find((a) => a.id === watched.id)).toBeUndefined()
  })
})

describe('bad keys', () => {
  it('stop the refresh at the first item with an auth error', async () => {
    await env.call(IPC.SETTINGS_SET_SECRET, 'bricklink', { ...BRICKLINK, bricklinkConsumerKey: 'revoked-key' })
    const before = env.apis.requests.filter((r) => r.service === 'bricklink').length
    const status = await refreshAndWait()
    expect(status).toMatchObject({ refreshed: 0, failed: 1, done: 1 })
    expect(status.total).toBeGreaterThan(1)
    expect(status.errors).toEqual([expect.objectContaining({ code: 'auth', message: expect.stringContaining('BrickLink rejected the keys') })])
    // Every remaining call would fail the same way, so none were made
    expect(env.apis.requests.filter((r) => r.service === 'bricklink').length - before).toBe(1)
  })
})
