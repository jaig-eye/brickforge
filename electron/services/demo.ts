/**
 * Demo mode: a sample collection in its own data folder, so anyone can try
 * BrickForge without API keys and without touching their real collection.
 * Price history is generated from each item's sample price and trend.
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import log from '../main/logger'
import { writeSettings } from '../main/settings-store'
import { getDb } from '../db/index'
import { addSet, addFig, updateSet, updateFig, tagItems } from '../db/queries/collection.queries'
import { recordPrice, setAlert } from '../db/queries/pricing.queries'
import { saveListing } from '../db/queries/listing.queries'
import { sanitizeHtml } from '../../src/lib/sanitize-html'
import type { EntityKind, PriceCondition, AlertDirection } from '../../src/lib/types'

export interface DemoItem {
  number: string
  name: string
  year: number | null
  theme: string | null
  image_url: string | null
  pieces?: number | null
  bricklink_id?: string | null
  condition: string
  owned: boolean
  paid?: number | null
  acquired_date?: string | null
  price_new?: number | null
  price_used?: number | null
  /** Yearly price drift, e.g. 0.12 = +12%/yr. */
  trend?: number
  tags?: string[]
  notes?: string | null
}

export interface DemoFixture {
  displayName: string
  sets: DemoItem[]
  figs: DemoItem[]
  alerts: { kind: EntityKind; id: string; condition: PriceCondition; direction: AlertDirection; target: number }[]
  listings: { set_number: string; set_name: string; year: number | null; title: string; description: string }[]
}

function fixturePath(): string {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'demo', 'collection.json'),
    path.join(app.getAppPath(), 'resources', 'demo', 'collection.json'),
  ]
  const found = candidates.find((p) => p && fs.existsSync(p))
  if (!found) throw new Error('Demo collection data is missing from this build.')
  return found
}

/** Deterministic PRNG so every demo looks the same (screenshots, tests). */
function rng(seed: string): () => number {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** Weekly points over ~8 months ending today, drifting toward today's price. */
function history(key: string, now: number, trend: number): { day: string; price: number }[] {
  const rand = rng(key)
  const out: { day: string; price: number }[] = []
  const weeks = 34
  for (let w = weeks; w >= 0; w--) {
    const daysAgo = w * 7
    const drift = Math.pow(1 + trend, -daysAgo / 365)
    const noise = w === 0 ? 1 : 1 + (rand() - 0.5) * 0.06
    const d = new Date(Date.now() - daysAgo * 86_400_000)
    out.push({ day: isoDay(d), price: Math.round(now * drift * noise * 100) / 100 })
  }
  return out
}

/** Seed the demo folder's database once. Safe to call on every demo launch. */
export function seedDemoIfEmpty(): void {
  const db = getDb()
  const count = (db.prepare('SELECT (SELECT COUNT(*) FROM sets) + (SELECT COUNT(*) FROM minifigures) AS n').get() as { n: number }).n
  if (count > 0) return
  let fixture: DemoFixture
  try {
    fixture = JSON.parse(fs.readFileSync(fixturePath(), 'utf8')) as DemoFixture
  } catch (err) {
    log.error('[demo] could not load the sample collection:', err)
    return
  }
  db.transaction(() => {
    for (const s of fixture.sets) {
      const { item } = addSet({
        set_number: s.number, name: s.name, year: s.year, theme: s.theme, piece_count: s.pieces ?? null,
        image_url: s.image_url, rebrickable_url: `https://rebrickable.com/sets/${s.number}/`,
      }, { as: s.owned ? 'owned' : 'wanted', condition: s.condition, acquired_price: s.paid ?? null, notes: s.notes ?? null })
      if (s.acquired_date) updateSet(item.id, { acquired_date: s.acquired_date })
      if (s.tags?.length) tagItems('set', [s.number], s.tags)
      seedPrices('set', s)
    }
    for (const f of fixture.figs) {
      const { item } = addFig({
        fig_number: f.number, name: f.name, image_url: f.image_url, bricklink_id: f.bricklink_id ?? null,
        theme: f.theme, year: f.year,
      }, { as: f.owned ? 'owned' : 'wanted', condition: f.condition, acquired_price: f.paid ?? null, notes: f.notes ?? null })
      if (f.acquired_date) updateFig(item.id, { acquired_date: f.acquired_date })
      // Stored under its BrickLink id when the sample knows it
      if (f.tags?.length) tagItems('minifig', [item.fig_number], f.tags)
      seedPrices('minifig', f, item.fig_number)
    }
    for (const a of fixture.alerts) {
      setAlert({ entity_type: a.kind, entity_id: a.id, condition: a.condition, direction: a.direction, target_price: a.target })
    }
    for (const l of fixture.listings) {
      saveListing({ ...l, description: sanitizeHtml(l.description), provider: 'demo' })
    }
  })()
  writeSettings({ displayName: fixture.displayName, onboardingDone: true, lastPriceRefreshAt: new Date().toISOString() })
  log.info(`[demo] seeded ${fixture.sets.length} sets and ${fixture.figs.length} minifigures`)
}

function seedPrices(kind: EntityKind, item: DemoItem, entityId = item.number): void {
  for (const cond of ['new', 'used'] as const) {
    const now = cond === 'new' ? item.price_new : item.price_used
    if (!now) continue
    for (const p of history(`${kind}:${item.number}:${cond}`, now, item.trend ?? 0.05)) {
      recordPrice({
        entity_type: kind, entity_id: entityId, condition: cond, source: 'sold',
        avg_price: p.price, min_price: Math.round(p.price * 0.82 * 100) / 100, max_price: Math.round(p.price * 1.25 * 100) / 100, sample_count: 12,
      }, p.day)
    }
  }
}
