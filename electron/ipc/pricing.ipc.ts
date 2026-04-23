import { ipcMain } from 'electron'
import { IPC } from '../../src/lib/ipc-types'
import { getPriceHistory, insertPricePoint, listAlerts, upsertAlert } from '../db/queries/pricing.queries'
import { fetchBricklinkPrice } from '../api/bricklink'

export function registerPricingHandlers(): void {
  ipcMain.handle(IPC.PRICE_HISTORY_GET, (_e, entityType: string, entityId: string) =>
    getPriceHistory(entityType, entityId)
  )

  ipcMain.handle(IPC.PRICE_FETCH_CURRENT, async (_e, setNum: string, condition: string) => {
    const result = await fetchBricklinkPrice(setNum, condition)
    if (result) {
      insertPricePoint({
        entity_type: 'set',
        entity_id: setNum,
        source: 'bricklink',
        condition,
        avg_price: result.avg_price,
        min_price: result.min_price ?? null,
        max_price: result.max_price ?? null,
        sample_count: result.sample_count ?? null,
        currency: 'USD',
      })
    }
    return result
  })

  ipcMain.handle(IPC.PRICE_ALERTS_LIST, () => listAlerts())
  ipcMain.handle(IPC.PRICE_ALERTS_SET, (_e, data) => upsertAlert(data))
}
