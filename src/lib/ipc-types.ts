/**
 * Every IPC channel between the renderer and the main process. Invoke
 * channels return IpcResult<T> (see errors.ts); push channels are events the
 * main process sends on its own.
 */
export const IPC = {
  // ── App ──────────────────────────────────────────────────────────────────
  APP_INFO:             'bf:app:info',
  APP_OPEN_EXTERNAL:    'bf:app:openExternal',
  APP_ENTER_DEMO:       'bf:app:enterDemo',
  APP_EXIT_DEMO:        'bf:app:exitDemo',
  APP_SHOW_DATA_FOLDER: 'bf:app:showDataFolder',

  // ── Settings ─────────────────────────────────────────────────────────────
  SETTINGS_GET:         'bf:settings:get',
  SETTINGS_SET_PREFS:   'bf:settings:setPrefs',
  SETTINGS_SET_AI:      'bf:settings:setAi',
  SETTINGS_SET_SECRET:  'bf:settings:setSecret',
  SETTINGS_TEST:        'bf:settings:test',

  // ── Collection ───────────────────────────────────────────────────────────
  SETS_LIST:            'bf:sets:list',
  FIGS_LIST:            'bf:figs:list',
  SET_UPDATE:           'bf:sets:update',
  FIG_UPDATE:           'bf:figs:update',
  ADD_SET:              'bf:collection:addSet',
  ADD_FIG:              'bf:collection:addFig',
  ITEMS_DELETE:         'bf:collection:delete',
  ITEMS_RESTORE:        'bf:collection:restore',
  ITEMS_BULK_UPDATE:    'bf:collection:bulkUpdate',
  COLLECTION_THEMES:    'bf:collection:themes',
  OWNERSHIP:            'bf:collection:ownership',
  FIG_SETS:             'bf:figs:sets',
  FIG_RESOLVE_BL:       'bf:figs:resolveBricklink',

  // ── Tags ─────────────────────────────────────────────────────────────────
  TAGS_LIST:            'bf:tags:list',
  TAGS_APPLY:           'bf:tags:apply',
  TAGS_REMOVE:          'bf:tags:remove',
  TAG_DELETE:           'bf:tags:delete',
  TAG_RENAME:           'bf:tags:rename',

  // ── Catalog (Rebrickable) ────────────────────────────────────────────────
  CATALOG_SETS:         'bf:catalog:sets',
  CATALOG_FIGS:         'bf:catalog:figs',
  CATALOG_THEMES:       'bf:catalog:themes',
  CATALOG_SET_DETAIL:   'bf:catalog:setDetail',
  CATALOG_FIG_IDS:      'bf:catalog:figIds',

  // ── Prices & alerts ──────────────────────────────────────────────────────
  PRICE_SUMMARY:        'bf:price:summary',
  PRICE_PORTFOLIO:      'bf:price:portfolio',
  PRICE_MOVERS:         'bf:price:movers',
  PRICE_HISTORY:        'bf:price:history',
  PRICE_LATEST:         'bf:price:latest',
  PRICE_REFRESH:        'bf:price:refresh',
  PRICE_REFRESH_ITEM:   'bf:price:refreshItem',
  PRICE_REFRESH_CANCEL: 'bf:price:cancel',
  PRICE_REFRESH_STATUS: 'bf:price:status',
  ALERTS_LIST:          'bf:alerts:list',
  ALERT_SET:            'bf:alerts:set',
  ALERT_DELETE:         'bf:alerts:delete',
  ALERT_REARM:          'bf:alerts:rearm',

  // ── Scan ─────────────────────────────────────────────────────────────────
  SCAN_ENQUEUE:         'bf:scan:enqueue',
  SCAN_LIST:            'bf:scan:list',
  SCAN_IMAGE:           'bf:scan:image',
  SCAN_RETRY:           'bf:scan:retry',
  SCAN_DISMISS:         'bf:scan:dismiss',
  SCAN_CLEAR:           'bf:scan:clear',
  SCAN_ACCEPT:          'bf:scan:accept',
  SCAN_PIECE:           'bf:scan:piece',
  SCAN_STATS:           'bf:scan:stats',

  // ── Sell (eBay listing writer) ───────────────────────────────────────────
  SELL_IDENTIFY:        'bf:sell:identify',
  SELL_GENERATE:        'bf:sell:generate',
  SELL_PRICE:           'bf:sell:price',
  SELL_HISTORY:         'bf:sell:history',
  SELL_DELETE:          'bf:sell:delete',

  // ── Data: import, export, backups, health ────────────────────────────────
  DATA_EXPORT_CSV:      'bf:data:exportCsv',
  DATA_IMPORT_PICK:     'bf:data:importPick',
  DATA_IMPORT_PHOTO:    'bf:data:importPhoto',
  DATA_IMPORT_RUN:      'bf:data:importRun',
  DATA_BACKUP_NOW:      'bf:data:backupNow',
  DATA_BACKUP_LIST:     'bf:data:backupList',
  DATA_BACKUP_RESTORE:  'bf:data:backupRestore',
  DATA_HEALTH:          'bf:data:health',
  DATA_ENRICH:          'bf:data:enrich',

  // ── Sync (optional Postgres) ─────────────────────────────────────────────
  SYNC_STATUS:          'bf:sync:status',
  SYNC_CONNECT:         'bf:sync:connect',
  SYNC_NOW:             'bf:sync:now',
  SYNC_DISCONNECT:      'bf:sync:disconnect',

  // ── Updates ──────────────────────────────────────────────────────────────
  UPDATE_STATE:         'bf:update:state',
  UPDATE_CHECK:         'bf:update:check',
  UPDATE_DOWNLOAD:      'bf:update:download',
  UPDATE_INSTALL:       'bf:update:install',

  // ── Window controls (send, no reply) ─────────────────────────────────────
  WIN_MINIMIZE:         'bf:window:minimize',
  WIN_MAXIMIZE:         'bf:window:maximize',
  WIN_CLOSE:            'bf:window:close',

  // ── Push events (main → renderer) ────────────────────────────────────────
  PUSH_SCAN:            'bf:push:scan',
  PUSH_REFRESH:         'bf:push:refresh',
  PUSH_ALERTS:          'bf:push:alerts',
  PUSH_IMPORT:          'bf:push:import',
  PUSH_UPDATE:          'bf:push:update',
  PUSH_SYNC:            'bf:push:sync',
  PUSH_DATA_CHANGED:    'bf:push:dataChanged',
  PUSH_FIG_IDS:         'bf:push:figIds',
} as const

export type IpcChannel = typeof IPC[keyof typeof IPC]

declare global {
  interface Window {
    ipc: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (channel: string, fn: (...args: unknown[]) => void) => () => void
      send: (channel: string, ...args: unknown[]) => void
    }
  }
}
