import { ipcMain } from 'electron'
import { IPC } from '../../src/lib/ipc-types'
import { registerProfileHandlers } from './profile.ipc'
import { registerCollectionHandlers } from './collection.ipc'
import { registerPricingHandlers } from './pricing.ipc'
import { registerAiHandlers } from './ai.ipc'
import { registerSettingsHandlers } from './settings.ipc'
import log from '../main/logger'

export function registerAllHandlers(): void {
  // Remove any stale handlers before re-registering (safe for dev restarts).
  Object.values(IPC).forEach((channel) => ipcMain.removeHandler(channel))

  const groups: [string, () => void][] = [
    ['profile',    registerProfileHandlers],
    ['collection', registerCollectionHandlers],
    ['pricing',    registerPricingHandlers],
    ['ai',         registerAiHandlers],
    ['settings',   registerSettingsHandlers],
  ]
  for (const [name, fn] of groups) {
    try {
      fn()
      log.info(`[IPC] ${name} handlers registered`)
    } catch (err) {
      log.error(`[IPC] ${name} handler registration failed:`, err)
    }
  }
}
