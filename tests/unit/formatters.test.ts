import { describe, it, expect } from 'vitest'
import {
  formatMoney, formatMoneyWhole, formatMoneyCompact, formatDelta, formatPct, formatNumber, formatPieces,
  parseStamp, formatDate, formatAgo, plural,
} from '../../src/lib/formatters'

const MINUS = '−'

describe('money', () => {
  it('formats dollars with cents and thousands separators', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
    expect(formatMoney(0)).toBe('$0.00')
  })

  it('shows an em dash when there is no value', () => {
    for (const v of [null, undefined, NaN, Infinity]) expect(formatMoney(v)).toBe('—')
    expect(formatMoneyWhole(null)).toBe('—')
    expect(formatMoneyCompact(undefined)).toBe('—')
  })

  it('rounds headline numbers to whole dollars and compacts chart axes', () => {
    expect(formatMoneyWhole(1234.56)).toBe('$1,235')
    expect(formatMoneyCompact(9800)).toBe('$9.8K')
  })
})

describe('deltas and percentages', () => {
  it('signs gains with + and losses with a real minus sign, not a hyphen', () => {
    expect(formatDelta(12.3)).toBe('+$12.30')
    expect(formatDelta(-4)).toBe(`${MINUS}$4.00`)
    expect(formatDelta(-4)).not.toContain('-')
    expect(formatDelta(0)).toBe('+$0.00')
  })

  it('formats percentages with one decimal by default', () => {
    expect(formatPct(12.345)).toBe('+12.3%')
    expect(formatPct(-4)).toBe(`${MINUS}4.0%`)
    expect(formatPct(22.8, 0)).toBe('+23%')
    expect(formatPct(null)).toBe('—')
    expect(formatDelta(NaN)).toBe('—')
  })
})

describe('counts', () => {
  it('formats numbers, pieces, and plurals', () => {
    expect(formatNumber(7541)).toBe('7,541')
    expect(formatNumber(null)).toBe('—')
    expect(formatPieces(7541)).toBe('7,541 pcs')
    expect(plural(1, 'set')).toBe('1 set')
    expect(plural(2, 'set')).toBe('2 sets')
    expect(plural(3, 'minifigure', 'minifigures')).toBe('3 minifigures')
  })
})

describe('timestamps', () => {
  it('reads SQLite "YYYY-MM-DD HH:MM:SS" stamps as UTC', () => {
    expect(parseStamp('2026-10-25 14:30:00').toISOString()).toBe('2026-10-25T14:30:00.000Z')
  })

  it('reads ISO stamps as given', () => {
    expect(parseStamp('2026-10-25T14:30:00.000Z').getTime()).toBe(Date.UTC(2026, 9, 25, 14, 30))
  })

  it('formats dates, and an em dash without one', () => {
    expect(formatDate('2026-10-25T12:00:00Z')).toBe('Oct 25, 2026')
    expect(formatDate(null)).toBe('—')
  })

  it('says how long ago a SQLite stamp was, measured in UTC', () => {
    const now = Date.UTC(2026, 9, 25, 12, 0, 0)
    expect(formatAgo('2026-10-25 11:59:40', now)).toBe('just now')
    expect(formatAgo('2026-10-25 11:55:00', now)).toBe('5 min ago')
    expect(formatAgo('2026-10-25 09:00:00', now)).toBe('3 h ago')
    expect(formatAgo('2026-10-24 12:00:00', now)).toBe('yesterday')
    expect(formatAgo('2026-10-22 12:00:00', now)).toBe('3 days ago')
    expect(formatAgo('2026-08-01 12:00:00', now)).toBe('Aug 1, 2026')
  })

  it('says "never" when there is no stamp', () => {
    expect(formatAgo(null)).toBe('never')
    expect(formatAgo('')).toBe('never')
  })
})
