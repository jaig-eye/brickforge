import { ipcMain } from 'electron'
import { IPC } from '../../src/lib/ipc-types'
import { getProfile, updateProfile } from '../db/queries/profile.queries'

export function registerProfileHandlers(): void {
  ipcMain.handle(IPC.PROFILE_GET, () => getProfile())

  ipcMain.handle(IPC.PROFILE_UPDATE, (_e, patch) => updateProfile(patch))
}
