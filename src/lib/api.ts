/**
 * The renderer's only door to the main process. Each function maps to one IPC
 * channel and returns typed data, throwing an AppError (with a code the UI
 * can react to) when the main process reports a failure.
 */
import { IPC } from './ipc-types'
import { AppError, type IpcResult } from './errors'
import type {
  AppInfo, PublicSettings, Preferences, SecretName, TestableService, CollectionQuery, CollectionSet, CollectionFig,
  SetPatch, FigPatch, LegoSet, Minifigure, AddOptions, AddResult, EntityKind, Tag, OwnershipIndex, CatalogSet,
  CatalogFig, CatalogTheme, CatalogPage, CatalogSetDetail, PortfolioSummary, PortfolioHistoryPoint, Mover,
  PricePoint, PriceAlert, AlertDirection, PriceCondition, RefreshStatus, ScanJob, ScanType, PieceIdentifyResult,
  ScanEvalStats, SetIdentifyResult, ListingPrefs, ListingResult, ListingHistoryEntry, PriceSuggestion, ImportItem,
  ImportPreview, ImportResult, BackupInfo, DataHealth, UpdateState, SyncStatus,
} from './types'
import type { AiProviderId } from './ai-models'

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await window.ipc.invoke(channel, ...args)) as IpcResult<T>
  if (!res || typeof res !== 'object' || !('ok' in res)) throw new AppError({ code: 'internal', message: 'Unexpected response from BrickForge.' })
  if (!res.ok) throw new AppError(res.error)
  return res.data
}

export type DeletedRow = (LegoSet | Minifigure) & { tags: string[] }
export type LatestPrices = Record<string, { new?: number; used?: number; at?: string }>

export const api = {
  app: {
    info: () => call<AppInfo>(IPC.APP_INFO),
    openExternal: (url: string) => call<void>(IPC.APP_OPEN_EXTERNAL, url),
    enterDemo: () => call<void>(IPC.APP_ENTER_DEMO),
    exitDemo: () => call<void>(IPC.APP_EXIT_DEMO),
    showDataFolder: () => call<string>(IPC.APP_SHOW_DATA_FOLDER),
  },
  settings: {
    get: () => call<PublicSettings>(IPC.SETTINGS_GET),
    setPrefs: (patch: Preferences) => call<PublicSettings>(IPC.SETTINGS_SET_PREFS, patch),
    setAi: (provider: AiProviderId, model: string | null) => call<PublicSettings>(IPC.SETTINGS_SET_AI, provider, model),
    setSecret: (name: SecretName, value: string | Record<string, string>) => call<PublicSettings>(IPC.SETTINGS_SET_SECRET, name, value),
    test: (service: TestableService, candidate?: string | Record<string, string>) => call<{ ok: true; detail: string }>(IPC.SETTINGS_TEST, service, candidate),
  },
  collection: {
    sets: (q: CollectionQuery = {}) => call<CollectionSet[]>(IPC.SETS_LIST, q),
    figs: (q: CollectionQuery = {}) => call<CollectionFig[]>(IPC.FIGS_LIST, q),
    updateSet: (id: number, patch: SetPatch) => call<LegoSet>(IPC.SET_UPDATE, id, patch),
    updateFig: (id: number, patch: FigPatch) => call<Minifigure>(IPC.FIG_UPDATE, id, patch),
    addSet: (setNumber: string, opts: AddOptions) => call<AddResult<LegoSet>>(IPC.ADD_SET, setNumber, opts),
    addFig: (fig: Partial<CatalogFig> & { set_num: string; bricklink_id?: string | null; theme?: string | null; year?: number | null }, opts: AddOptions) =>
      call<AddResult<Minifigure>>(IPC.ADD_FIG, fig, opts),
    remove: (kind: EntityKind, ids: number[]) => call<DeletedRow[]>(IPC.ITEMS_DELETE, kind, ids),
    restore: (kind: EntityKind, rows: DeletedRow[]) => call<number>(IPC.ITEMS_RESTORE, kind, rows),
    bulkUpdate: (kind: EntityKind, ids: number[], patch: { condition?: string; is_owned?: 0 | 1; is_wanted?: 0 | 1 }) =>
      call<number>(IPC.ITEMS_BULK_UPDATE, kind, ids, patch),
    themes: () => call<{ sets: string[]; figs: string[] }>(IPC.COLLECTION_THEMES),
    ownership: () => call<OwnershipIndex>(IPC.OWNERSHIP),
    figSets: (figNumber: string) => call<CatalogSet[]>(IPC.FIG_SETS, figNumber),
    resolveBricklink: (id: number) => call<{ bricklink_id: string | null; item: { no: string; name: string } | null }>(IPC.FIG_RESOLVE_BL, id),
  },
  tags: {
    list: () => call<Tag[]>(IPC.TAGS_LIST),
    apply: (kind: EntityKind, numbers: string[], tags: string[]) => call<number>(IPC.TAGS_APPLY, kind, numbers, tags),
    remove: (kind: EntityKind, numbers: string[], tag: string) => call<number>(IPC.TAGS_REMOVE, kind, numbers, tag),
    delete: (name: string) => call<void>(IPC.TAG_DELETE, name),
    rename: (from: string, to: string) => call<void>(IPC.TAG_RENAME, from, to),
  },
  catalog: {
    sets: (o: { search?: string; theme_id?: number | null; page?: number; ordering?: string; setsOnly?: boolean }) => call<CatalogPage<CatalogSet>>(IPC.CATALOG_SETS, o),
    figs: (o: { search?: string; theme_id?: number | null; page?: number }) => call<CatalogPage<CatalogFig>>(IPC.CATALOG_FIGS, o),
    themes: () => call<CatalogTheme[]>(IPC.CATALOG_THEMES),
    setDetail: (setNumber: string) => call<CatalogSetDetail>(IPC.CATALOG_SET_DETAIL, setNumber),
    /** BrickLink ids for Rebrickable search results: known now, the rest arrive on PUSH_FIG_IDS */
    figIds: (results: { id: string; name: string }[]) => call<Record<string, string | null>>(IPC.CATALOG_FIG_IDS, results),
  },
  prices: {
    summary: () => call<PortfolioSummary>(IPC.PRICE_SUMMARY),
    portfolio: (days: number) => call<PortfolioHistoryPoint[]>(IPC.PRICE_PORTFOLIO, days),
    movers: (days: number, limit = 8) => call<Mover[]>(IPC.PRICE_MOVERS, days, limit),
    history: (kind: EntityKind, id: string, days = 365) => call<PricePoint[]>(IPC.PRICE_HISTORY, kind, id, days),
    latest: (kind: EntityKind, ids: string[]) => call<LatestPrices>(IPC.PRICE_LATEST, kind, ids),
    refresh: () => call<RefreshStatus>(IPC.PRICE_REFRESH),
    refreshItem: (kind: EntityKind, id: string, condition?: PriceCondition) => call<number | null>(IPC.PRICE_REFRESH_ITEM, kind, id, condition),
    cancel: () => call<void>(IPC.PRICE_REFRESH_CANCEL),
    status: () => call<RefreshStatus>(IPC.PRICE_REFRESH_STATUS),
  },
  alerts: {
    list: () => call<PriceAlert[]>(IPC.ALERTS_LIST),
    set: (a: { entity_type: EntityKind; entity_id: string; condition: PriceCondition; direction: AlertDirection; target_price: number }) => call<PriceAlert>(IPC.ALERT_SET, a),
    remove: (id: number) => call<void>(IPC.ALERT_DELETE, id),
    rearm: (id: number) => call<void>(IPC.ALERT_REARM, id),
  },
  scan: {
    enqueue: (images: string[], scanType: ScanType, splitGroups: boolean) => call<{ enqueued: number }>(IPC.SCAN_ENQUEUE, images, { scanType, splitGroups }),
    list: () => call<ScanJob[]>(IPC.SCAN_LIST),
    image: (id: number) => call<string | null>(IPC.SCAN_IMAGE, id),
    retry: (id: number) => call<void>(IPC.SCAN_RETRY, id),
    dismiss: (ids: number[]) => call<void>(IPC.SCAN_DISMISS, ids),
    clear: () => call<number>(IPC.SCAN_CLEAR),
    accept: (id: number, chosen: string | null, auto = false) => call<void>(IPC.SCAN_ACCEPT, id, chosen, auto),
    piece: (image: string) => call<PieceIdentifyResult>(IPC.SCAN_PIECE, image),
    stats: () => call<ScanEvalStats>(IPC.SCAN_STATS),
  },
  sell: {
    identify: (image: string, hint?: string) => call<SetIdentifyResult>(IPC.SELL_IDENTIFY, image, hint),
    generate: (setNumber: string, prefs: ListingPrefs) => call<ListingResult>(IPC.SELL_GENERATE, setNumber, prefs),
    price: (setNumber: string, condition: PriceCondition) => call<PriceSuggestion | null>(IPC.SELL_PRICE, setNumber, condition),
    history: () => call<ListingHistoryEntry[]>(IPC.SELL_HISTORY),
    remove: (id: number) => call<void>(IPC.SELL_DELETE, id),
  },
  data: {
    exportCsv: () => call<{ canceled: true } | { canceled: false; fileName: string; sets: number; figs: number }>(IPC.DATA_EXPORT_CSV),
    pickImport: () => call<ImportPreview>(IPC.DATA_IMPORT_PICK),
    readListPhoto: (image: string) => call<{ rows: (ImportItem & { confidence: number; raw?: string })[] }>(IPC.DATA_IMPORT_PHOTO, image),
    runImport: (items: ImportItem[], as: 'owned' | 'wanted') => call<ImportResult>(IPC.DATA_IMPORT_RUN, items, as),
    backupNow: () => call<string>(IPC.DATA_BACKUP_NOW),
    backups: () => call<BackupInfo[]>(IPC.DATA_BACKUP_LIST),
    restore: (name?: string) => call<{ restored: boolean }>(IPC.DATA_BACKUP_RESTORE, name),
    health: () => call<DataHealth>(IPC.DATA_HEALTH),
    enrich: () => call<{ fixed: number }>(IPC.DATA_ENRICH),
  },
  sync: {
    status: () => call<SyncStatus>(IPC.SYNC_STATUS),
    connect: (url: string) => call<SyncStatus>(IPC.SYNC_CONNECT, url),
    now: () => call<SyncStatus>(IPC.SYNC_NOW),
    disconnect: () => call<SyncStatus>(IPC.SYNC_DISCONNECT),
  },
  updates: {
    state: () => call<UpdateState>(IPC.UPDATE_STATE),
    check: () => call<UpdateState>(IPC.UPDATE_CHECK),
    download: () => call<void>(IPC.UPDATE_DOWNLOAD),
    install: () => call<void>(IPC.UPDATE_INSTALL),
  },
  window: {
    minimize: () => window.ipc.send(IPC.WIN_MINIMIZE),
    maximize: () => window.ipc.send(IPC.WIN_MAXIMIZE),
    close: () => window.ipc.send(IPC.WIN_CLOSE),
  },
  /** Subscribe to a push channel; returns the unsubscribe function. */
  on<T>(channel: string, fn: (payload: T) => void): () => void {
    return window.ipc.on(channel, (...args) => fn(args[0] as T))
  },
}

/** Read a dropped/picked File as base64 (no data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

export function errorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message
  return err instanceof Error ? err.message : String(err)
}
