import { ipcMain } from 'electron'
import { IPC } from '../../src/lib/ipc-types'
import {
  listSets, getSet, upsertSet, deleteSet,
  listMinifigures, upsertMinifigure, deleteMinifigure, setMinifigBricklinkId,
  type SetFilter,
} from '../db/queries/collection.queries'
import {
  searchRebrickableSets, importRebrickableSet, lookupRebrickableSet, getSetMinifigCount,
  browseRebrickableSets, browseRebrickableMinifigs, getThemes,
  inspectRebrickableSet, getMinifigExternalIds, searchRebrickableMinifigs, getMinifigSets,
  type BrowseOpts,
} from '../api/rebrickable'
import { searchBricklinkMinifigs } from '../api/bricklink'

export function registerCollectionHandlers(): void {
  ipcMain.handle(IPC.SETS_LIST, (_e, filter?: SetFilter) => listSets(filter))
  ipcMain.handle(IPC.SETS_GET, (_e, id: number) => getSet(id))
  ipcMain.handle(IPC.SETS_UPSERT, (_e, data) => upsertSet(data))
  ipcMain.handle(IPC.SETS_DELETE, (_e, id: number) => deleteSet(id))
  ipcMain.handle(IPC.SETS_SEARCH_REBRICK, (_e, query: string) => searchRebrickableSets(query))
  ipcMain.handle(IPC.SETS_IMPORT_REBRICK, (_e, setNum: string) => importRebrickableSet(setNum))
  ipcMain.handle(IPC.SETS_LOOKUP_REBRICK,        (_e, setNum: string) => lookupRebrickableSet(setNum))
  ipcMain.handle(IPC.SETS_MINIFIG_COUNT_REBRICK, (_e, setNum: string) => getSetMinifigCount(setNum))

  ipcMain.handle(IPC.FIGS_LIST, (_e, filter) => listMinifigures(filter))
  ipcMain.handle(IPC.FIGS_GET, (_e, id: number) => {
    const all = listMinifigures()
    return all.find((f) => f.id === id) ?? null
  })
  ipcMain.handle(IPC.FIGS_UPSERT, (_e, data) => upsertMinifigure(data))
  ipcMain.handle(IPC.FIGS_DELETE, (_e, id: number) => deleteMinifigure(id))
  ipcMain.handle(IPC.FIGS_SET_BRICKLINK_ID, (_e, figNumber: string, bricklinkId: string) =>
    setMinifigBricklinkId(figNumber, bricklinkId)
  )
  ipcMain.handle(IPC.FIGS_LOOKUP_BL_ID, (_e, figNumber: string) =>
    getMinifigExternalIds(figNumber)
  )
  ipcMain.handle(IPC.FIGS_GET_SETS, (_e, figNumber: string) =>
    getMinifigSets(figNumber)
  )
  ipcMain.handle(IPC.FIGS_SEARCH_BL, async (_e, query: string) => {
    // Run both searches in parallel; BrickLink catalog search may return empty if endpoint unavailable
    const [blResults, rbResults] = await Promise.all([
      searchBricklinkMinifigs(query),
      searchRebrickableMinifigs(query),
    ])
    return { bricklink: blResults, rebrickable: rbResults }
  })

  // ── Catalog Browser ────────────────────────────────────────────────────────
  ipcMain.handle(IPC.CATALOG_BROWSE_SETS,    (_e, opts: BrowseOpts) => browseRebrickableSets(opts))
  ipcMain.handle(IPC.CATALOG_BROWSE_MINIFIGS,(_e, opts: BrowseOpts) => browseRebrickableMinifigs(opts))
  ipcMain.handle(IPC.CATALOG_THEMES,         () => getThemes())
  ipcMain.handle(IPC.CATALOG_OWNED_NUMS, () => ({
    sets: listSets({}).map((s) => s.set_number),
    figs: listMinifigures({}).map((f) => f.fig_number),
  }))

  ipcMain.handle(IPC.CATALOG_ADD_SET, (_e, data: {
    set_num: string; name: string; year: number; num_parts: number
    set_img_url: string; set_url: string
    is_owned: 0 | 1; is_wanted: 0 | 1
    condition: string; acquired_price: number | null
  }) => upsertSet({
    set_number: data.set_num,
    name: data.name,
    year: data.year,
    theme: null,
    piece_count: data.num_parts,
    retail_price_usd: null,
    image_url: data.set_img_url,
    rebrickable_url: data.set_url,
    bricklink_url: `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${data.set_num}`,
    notes: null,
    is_owned: data.is_owned,
    is_wanted: data.is_wanted,
    condition: (data.condition as 'sealed' | 'open_complete' | 'open_incomplete') || 'open_complete',
    acquired_date: data.is_owned ? new Date().toISOString().split('T')[0] : null,
    acquired_price: data.acquired_price,
  }))

  ipcMain.handle(IPC.CATALOG_INSPECT_SET, (_e, setNum: string) => inspectRebrickableSet(setNum))

  ipcMain.handle(IPC.CATALOG_ADD_FIG, (_e, data: {
    set_num: string; name: string; set_img_url: string
    is_owned: 0 | 1; is_wanted: 0 | 1
    condition?: 'new' | 'used' | 'cracked'
    acquired_price?: number | null
  }) => upsertMinifigure({
    fig_number: data.set_num,
    name: data.name,
    character: null,
    theme: null,
    year: null,
    image_url: data.set_img_url,
    bricklink_url: `https://www.bricklink.com/v2/catalog/catalogitem.page?M=${data.set_num}`,
    bricklink_id: null,
    notes: null,
    is_owned: data.is_owned,
    is_wanted: data.is_wanted,
    quantity: 1,
    condition: data.condition ?? 'used',
    acquired_price: data.acquired_price ?? null,
  }))
}
