import { IPC } from '../../src/lib/ipc-types'
import { missingKey } from '../../src/lib/errors'
import { hasBricklinkCredentials } from '../api/bricklink'
import {
  portfolioSummary, portfolioHistory, movers, getPriceHistory, latestPrices,
  listAlerts, setAlert, deleteAlert, rearmAlert,
} from '../db/queries/pricing.queries'
import { getSetByNumber, findFig } from '../db/queries/collection.queries'
import { refreshAll, refreshStatus, cancelRefresh, priceItem, runAlerts } from '../services/pricing'
import { handle, str, int, kind, cond, obj } from './handle'

const days = (v: unknown, fallback: number) => Math.max(1, Math.min(3650, Math.floor(Number(v) || fallback)))

export function registerPricingHandlers(): void {
  handle(IPC.PRICE_SUMMARY, () => portfolioSummary())
  handle(IPC.PRICE_PORTFOLIO, (d?: unknown) => portfolioHistory(days(d, 365)))
  handle(IPC.PRICE_MOVERS, (d?: unknown, limit?: unknown) => movers(days(d, 30), Math.max(1, Math.min(50, Number(limit) || 8))))
  handle(IPC.PRICE_HISTORY, (k: unknown, id: unknown, d?: unknown) => getPriceHistory(kind(k), str(id, 40), days(d, 365)))
  handle(IPC.PRICE_LATEST, (k: unknown, list: unknown) =>
    latestPrices(kind(k), (Array.isArray(list) ? list : []).slice(0, 2000).map((n) => str(n, 40))))

  // A full refresh can take minutes: start it and report through PUSH_REFRESH
  handle(IPC.PRICE_REFRESH, () => {
    // Without keys it can't start. Say so here: refreshAll's own check only
    // rejects the background promise, which nothing hears
    if (!hasBricklinkCredentials()) throw missingKey('bricklink', 'your four BrickLink API keys')
    void refreshAll('manual').catch(() => undefined)
    return refreshStatus()
  })
  handle(IPC.PRICE_REFRESH_STATUS, () => refreshStatus())
  handle(IPC.PRICE_REFRESH_CANCEL, () => cancelRefresh())
  handle(IPC.PRICE_REFRESH_ITEM, async (k: unknown, id: unknown, c?: unknown) => {
    const entity = kind(k)
    const num = str(id, 40)
    const fig = entity === 'minifig' ? findFig(num) : null
    const condition = c ? cond(c)
      : entity === 'set' ? (getSetByNumber(num)?.condition === 'sealed' ? 'new' : 'used')
      : (fig?.condition === 'new' ? 'new' : 'used')
    const price = await priceItem(entity, fig?.fig_number ?? num, condition, fig?.bricklink_id)
    runAlerts()
    return price
  })

  handle(IPC.ALERTS_LIST, () => listAlerts())
  handle(IPC.ALERT_SET, (a: unknown) => {
    const v = obj<{ entity_type: string; entity_id: string; condition: string; direction: string; target_price: number }>(a)
    const alert = setAlert({
      entity_type: kind(v.entity_type), entity_id: str(v.entity_id, 40), condition: cond(v.condition),
      direction: v.direction === 'above' ? 'above' : 'below', target_price: Number(v.target_price),
    })
    runAlerts()
    return alert
  })
  handle(IPC.ALERT_DELETE, (id: unknown) => deleteAlert(int(id)))
  handle(IPC.ALERT_REARM, (id: unknown) => { rearmAlert(int(id)); runAlerts() })
}
