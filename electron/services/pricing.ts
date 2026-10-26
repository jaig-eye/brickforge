/**
 * Price refresh: fetches BrickLink prices for everything you own or want (and
 * anything with an alert), one item at a time with a short gap, reporting
 * progress as it goes. Runs on demand, and on its own once a day while the
 * app is open when automatic refresh is on.
 */
import { IPC } from '../../src/lib/ipc-types'
import { AppError } from '../../src/lib/errors'
import { bricklinkLookupId } from '../../src/lib/lego-ids'
import { formatMoney } from '../../src/lib/formatters'
import type { RefreshStatus, EntityKind, PriceCondition, TriggeredAlert } from '../../src/lib/types'
import log from '../main/logger'
import { readSettings, writeSettings } from '../main/settings-store'
import { fetchBricklinkPrice, hasBricklinkCredentials } from '../api/bricklink'
import { hasRebrickableKey } from '../api/rebrickable'
import { itemsToPrice, recordPrice, evaluateAlerts } from '../db/queries/pricing.queries'
import { ensureFigBricklinkId } from './catalog'
import { push, notifyDesktop } from './notify'

const GAP_MS = 250
const DAY_MS = 24 * 60 * 60 * 1000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let status: RefreshStatus = {
  running: false, done: 0, total: 0, current: null, refreshed: 0, failed: 0, errors: [],
  startedAt: null, finishedAt: null, reason: null,
}
let cancelRequested = false

export const refreshStatus = (): RefreshStatus => status

function update(patch: Partial<RefreshStatus>): void {
  status = { ...status, ...patch }
  push(IPC.PUSH_REFRESH, status)
}

/** Price one item now. Returns the stored price, or null when BrickLink has none. */
export async function priceItem(kind: EntityKind, id: string, condition: PriceCondition, bricklinkId?: string | null): Promise<number | null> {
  let lookup = kind === 'set' ? id : bricklinkLookupId(id, bricklinkId)
  if (!lookup && kind === 'minifig' && hasRebrickableKey()) lookup = await ensureFigBricklinkId(id)
  if (!lookup) {
    throw new AppError({ code: 'not_found', service: 'bricklink', message: 'No BrickLink id is known for this minifigure yet. Add it from its details.' })
  }
  const res = await fetchBricklinkPrice(lookup, condition, kind === 'set' ? 'SET' : 'MINIFIG')
  if (!res) return null
  recordPrice({
    entity_type: kind, entity_id: id, condition, source: res.source,
    avg_price: res.avg_price, min_price: res.min_price, max_price: res.max_price, sample_count: res.sample_count,
  })
  return res.avg_price
}

/** Start a full refresh (no-op if one is running). Resolves when it ends. */
export async function refreshAll(reason: 'manual' | 'scheduled' = 'manual'): Promise<RefreshStatus> {
  if (status.running) return status
  if (!hasBricklinkCredentials()) {
    throw new AppError({ code: 'missing_key', service: 'bricklink', message: 'Add your four BrickLink API keys in Settings to get market prices.' })
  }
  const items = itemsToPrice()
  cancelRequested = false
  update({
    running: true, done: 0, total: items.length, current: null, refreshed: 0, failed: 0, errors: [],
    startedAt: new Date().toISOString(), finishedAt: null, reason,
  })
  let refreshed = 0, failed = 0
  const errors: RefreshStatus['errors'] = []
  try {
    for (const [i, item] of items.entries()) {
      if (cancelRequested) break
      update({ done: i, current: item.name })
      try {
        const price = await priceItem(item.kind, item.id, item.condition, item.bricklink_id)
        if (price != null) refreshed++
        else { failed++; errors.push({ id: item.id, message: 'BrickLink has no sales or listings for this.', code: 'not_found' }) }
      } catch (err) {
        failed++
        const message = err instanceof Error ? err.message : String(err)
        // The code lets the UI tell bad keys from a missing price without reading messages
        errors.push({ id: item.id, message, code: err instanceof AppError ? err.code : 'internal' })
        // Bad keys or no connection: every remaining call would fail the same way
        if (err instanceof AppError && (err.code === 'auth' || err.code === 'network' || err.code === 'missing_key')) {
          log.warn('[pricing] refresh stopped:', message)
          break
        }
      }
      if (i < items.length - 1) await sleep(GAP_MS)
    }
  } finally {
    update({ running: false, done: refreshed + failed, current: null, refreshed, failed, errors: errors.slice(-20), finishedAt: new Date().toISOString() })
  }
  if (refreshed > 0) {
    writeSettings({ lastPriceRefreshAt: new Date().toISOString() })
    push(IPC.PUSH_DATA_CHANGED, { kind: 'prices' })
  }
  runAlerts()
  return status
}

export function cancelRefresh(): void {
  if (status.running) cancelRequested = true
}

/** Fire alerts whose target was crossed: in-app and as a desktop notification. */
export function runAlerts(): TriggeredAlert[] {
  try {
    const fired = evaluateAlerts()
    if (!fired.length) return []
    push(IPC.PUSH_ALERTS, fired)
    for (const a of fired.slice(0, 3)) {
      const verb = a.direction === 'above' ? 'rose to' : 'dropped to'
      notifyDesktop(`Price alert: ${a.name ?? a.entity_id}`, `${a.condition === 'new' ? 'New' : 'Used'} price ${verb} ${formatMoney(a.current_price)} (your target: ${formatMoney(a.target_price)}).`)
    }
    if (fired.length > 3) notifyDesktop('Price alerts', `${fired.length - 3} more alerts fired. Open BrickForge to see them.`)
    return fired
  } catch (err) {
    log.warn('[pricing] alert check failed:', err)
    return []
  }
}

let timer: NodeJS.Timeout | null = null

/** Daily automatic refresh: checks hourly whether a day has passed since the last one. */
export function startScheduler(): void {
  const tick = () => {
    const s = readSettings()
    if (s.autoRefreshPrices === false || status.running || !hasBricklinkCredentials()) return
    const last = s.lastPriceRefreshAt ? Date.parse(s.lastPriceRefreshAt) : 0
    if (Date.now() - last < DAY_MS - 30 * 60 * 1000) return
    void refreshAll('scheduled').catch((err) => log.warn('[pricing] scheduled refresh failed:', err))
  }
  setTimeout(tick, 20_000) // let startup settle first
  timer = setInterval(tick, 60 * 60 * 1000)
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
  cancelRequested = true
}
