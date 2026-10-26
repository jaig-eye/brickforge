import log from '../main/logger'
import { registerAppHandlers } from './app.ipc'
import { registerSettingsHandlers } from './settings.ipc'
import { registerCollectionHandlers } from './collection.ipc'
import { registerPricingHandlers } from './pricing.ipc'
import { registerScanHandlers } from './scan.ipc'
import { registerSellHandlers } from './sell.ipc'
import { registerDataHandlers } from './data.ipc'

export function registerAllHandlers(): void {
  const groups: [string, () => void][] = [
    ['app', registerAppHandlers],
    ['settings', registerSettingsHandlers],
    ['collection', registerCollectionHandlers],
    ['pricing', registerPricingHandlers],
    ['scan', registerScanHandlers],
    ['sell', registerSellHandlers],
    ['data', registerDataHandlers],
  ]
  for (const [name, register] of groups) {
    try {
      register()
    } catch (err) {
      log.error(`[ipc] ${name} handlers failed to register:`, err)
    }
  }
}
