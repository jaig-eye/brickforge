import { registerProfileHandlers } from './profile.ipc'
import { registerCollectionHandlers } from './collection.ipc'
import { registerPricingHandlers } from './pricing.ipc'
import { registerAiHandlers } from './ai.ipc'
import { registerSettingsHandlers } from './settings.ipc'

export function registerAllHandlers(): void {
  registerProfileHandlers()
  registerCollectionHandlers()
  registerPricingHandlers()
  registerAiHandlers()
  registerSettingsHandlers()
}
