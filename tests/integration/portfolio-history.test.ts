/**
 * The Value chart's line: it spans the whole range picked, opening at the
 * last price known before the range, even when only one price update (or
 * none) falls inside it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../helpers/env'

let env: TestEnv
let q: typeof import('../../electron/db/queries/pricing.queries')
let today: string
let daysAgo: (n: number) => string

beforeAll(async () => {
  env = await createTestEnv()
  q = await import('../../electron/db/queries/pricing.queries')
  const { addSet } = await import('../../electron/db/queries/collection.queries')
  const { getDb } = await import('../../electron/db/index')
  daysAgo = (n) => (getDb().prepare(`SELECT date('now', ?) AS d`).get(`-${n} days`) as { d: string }).d
  today = daysAgo(0)
  addSet({ set_number: '10497-1', name: 'Galaxy Explorer', year: 2022, theme: 'Icons', piece_count: 1254, image_url: null, rebrickable_url: null }, { as: 'owned', condition: 'sealed' })
})
afterAll(() => env.close())

const price = (avg: number, day: string) =>
  q.recordPrice({ entity_type: 'set', entity_id: '10497-1', condition: 'new', source: 'bricklink', avg_price: avg, min_price: null, max_price: null, sample_count: 3 }, day)

describe('portfolio history', () => {
  it('runs from the last price before the range to today when nothing changed inside it', () => {
    price(100, daysAgo(120))
    expect(q.portfolioHistory(90).map((p) => [p.day, p.total])).toEqual([[daysAgo(90), 100], [today, 100]])
  })

  it('opens at the earlier price when the only update inside the range is today', () => {
    price(150, today)
    expect(q.portfolioHistory(90).map((p) => [p.day, p.total])).toEqual([[daysAgo(90), 100], [today, 150]])
  })

  it('starts at the first recorded day when the range covers all history', () => {
    const all = q.portfolioHistory(36500)
    expect(all.map((p) => [p.day, p.total])).toEqual([[daysAgo(120), 100], [today, 150]])
  })
})
