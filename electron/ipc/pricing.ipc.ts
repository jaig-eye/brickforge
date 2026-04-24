import { ipcMain } from 'electron'
import { IPC } from '../../src/lib/ipc-types'
import {
  getPriceHistory, insertPricePoint, listAlerts, upsertAlert,
  getBulkLatestPrices, getBulkLatestFigPrices, getPortfolioStats,
} from '../db/queries/pricing.queries'
import { listSets } from '../db/queries/collection.queries'
import { listMinifigures } from '../db/queries/collection.queries'
import { fetchBricklinkPrice, hasBricklinkCredentials } from '../api/bricklink'
import log from '../main/logger'

/**
 * Normalize set condition to 'new' or 'used' for BrickLink API and DB storage.
 * sealed → new; open_complete / open_incomplete / used → used
 */
function normCondition(c: string): 'new' | 'used' {
  return (c === 'new' || c === 'sealed') ? 'new' : 'used'
}

/**
 * Normalize minifig condition to 'new' or 'used' for BrickLink API and DB storage.
 * cracked maps to 'used' (BrickLink has no cracked condition).
 */
function normFigCondition(c: string): 'new' | 'used' {
  return c === 'new' ? 'new' : 'used'
}

export function registerPricingHandlers(): void {
  ipcMain.handle(IPC.PRICE_HISTORY_GET, (_e, entityType: string, entityId: string) =>
    getPriceHistory(entityType, entityId)
  )

  ipcMain.handle(IPC.PRICE_FETCH_CURRENT, async (_e, setNum: string, condition: string) => {
    if (!hasBricklinkCredentials()) throw new Error('BrickLink credentials not configured — add them in Settings')
    const norm = normCondition(condition)
    const result = await fetchBricklinkPrice(setNum, norm, 'S')
    if (result) {
      insertPricePoint({
        entity_type: 'set',
        entity_id: setNum,
        source: result.source,
        condition: norm,
        avg_price: result.avg_price,
        min_price: result.min_price ?? null,
        max_price: result.max_price ?? null,
        sample_count: result.sample_count ?? null,
        currency: 'USD',
      })
    }
    return result
  })

  /** Return latest cached prices for a batch of set numbers without hitting BrickLink. */
  ipcMain.handle(IPC.PRICE_GET_BULK, (_e, setNums: string[]) =>
    getBulkLatestPrices(setNums)
  )

  /** Portfolio totals using cached price_history data. */
  ipcMain.handle(IPC.PRICE_PORTFOLIO_STATS, () => getPortfolioStats())

  /** Fetch fresh BrickLink prices for all owned sets and persist to price_history. */
  ipcMain.handle(IPC.PRICE_REFRESH_COLLECTION, async () => {
    if (!hasBricklinkCredentials()) throw new Error('BrickLink credentials not configured — add them in Settings')
    const sets = listSets({ is_owned: 1 })
    let refreshed = 0
    const errors: string[] = []
    for (const s of sets) {
      const norm = normCondition(s.condition)
      try {
        const result = await fetchBricklinkPrice(s.set_number, norm, 'S')
        if (result) {
          insertPricePoint({
            entity_type: 'set',
            entity_id: s.set_number,
            source: result.source,
            condition: norm,
            avg_price: result.avg_price,
            min_price: result.min_price ?? null,
            max_price: result.max_price ?? null,
            sample_count: result.sample_count ?? null,
            currency: 'USD',
          })
          refreshed++
        } else {
          errors.push(`${s.set_number}: no price data found`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`[Pricing] refresh failed for ${s.set_number}:`, msg)
        errors.push(`${s.set_number}: ${msg}`)
      }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (errors.length) log.warn('[Pricing] refresh errors:', errors)
    return { refreshed, total: sets.length, errors }
  })

  // ── Minifig pricing ─────────────────────────────────────────────────────

  /** Fetch fresh BrickLink price for a single minifig. */
  ipcMain.handle(IPC.PRICE_FETCH_FIG, async (_e, figNum: string, condition: string) => {
    const norm = normFigCondition(condition)
    const result = await fetchBricklinkPrice(figNum, norm, 'M')
    if (result) {
      insertPricePoint({
        entity_type: 'minifig',
        entity_id: figNum,
        source: result.source,
        condition: norm,
        avg_price: result.avg_price,
        min_price: result.min_price ?? null,
        max_price: result.max_price ?? null,
        sample_count: result.sample_count ?? null,
        currency: 'USD',
      })
    }
    return result
  })

  /** Return latest cached prices for a batch of minifig numbers. */
  ipcMain.handle(IPC.PRICE_GET_BULK_FIGS, (_e, figNums: string[]) =>
    getBulkLatestFigPrices(figNums)
  )

  /** Fetch fresh BrickLink prices for all owned minifigs. */
  ipcMain.handle(IPC.PRICE_REFRESH_FIGS, async () => {
    if (!hasBricklinkCredentials()) throw new Error('BrickLink credentials not configured — add them in Settings')
    const figs = listMinifigures({ is_owned: 1 })
    let refreshed = 0
    const errors: string[] = []
    for (const f of figs) {
      const norm = normFigCondition(f.condition)
      try {
        const result = await fetchBricklinkPrice(f.fig_number, norm, 'M')
        if (result) {
          insertPricePoint({
            entity_type: 'minifig',
            entity_id: f.fig_number,
            source: result.source,
            condition: norm,
            avg_price: result.avg_price,
            min_price: result.min_price ?? null,
            max_price: result.max_price ?? null,
            sample_count: result.sample_count ?? null,
            currency: 'USD',
          })
          refreshed++
        } else {
          errors.push(`${f.fig_number}: no price data found`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`[Pricing] fig refresh failed for ${f.fig_number}:`, msg)
        errors.push(`${f.fig_number}: ${msg}`)
      }
      await new Promise((r) => setTimeout(r, 300))
    }
    if (errors.length) log.warn('[Pricing] fig refresh errors:', errors)
    return { refreshed, total: figs.length, errors }
  })

  ipcMain.handle(IPC.PRICE_ALERTS_LIST, () => listAlerts())
  ipcMain.handle(IPC.PRICE_ALERTS_SET, (_e, data) => upsertAlert(data))
}
