import { ipcMain } from 'electron'
import { IPC } from '../../src/lib/ipc-types'
import {
  listSets, getSet, upsertSet, deleteSet,
  listMinifigures, upsertMinifigure, deleteMinifigure,
  type SetFilter,
} from '../db/queries/collection.queries'
import { searchRebrickableSets, importRebrickableSet } from '../api/rebrickable'

export function registerCollectionHandlers(): void {
  ipcMain.handle(IPC.SETS_LIST, (_e, filter?: SetFilter) => listSets(filter))
  ipcMain.handle(IPC.SETS_GET, (_e, id: number) => getSet(id))
  ipcMain.handle(IPC.SETS_UPSERT, (_e, data) => upsertSet(data))
  ipcMain.handle(IPC.SETS_DELETE, (_e, id: number) => deleteSet(id))
  ipcMain.handle(IPC.SETS_SEARCH_REBRICK, (_e, query: string) => searchRebrickableSets(query))
  ipcMain.handle(IPC.SETS_IMPORT_REBRICK, (_e, setNum: string) => importRebrickableSet(setNum))

  ipcMain.handle(IPC.FIGS_LIST, (_e, filter) => listMinifigures(filter))
  ipcMain.handle(IPC.FIGS_GET, (_e, id: number) => {
    const all = listMinifigures()
    return all.find((f) => f.id === id) ?? null
  })
  ipcMain.handle(IPC.FIGS_UPSERT, (_e, data) => upsertMinifigure(data))
  ipcMain.handle(IPC.FIGS_DELETE, (_e, id: number) => deleteMinifigure(id))
}
