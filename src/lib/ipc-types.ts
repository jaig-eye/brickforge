export const IPC = {
  // ── Profile ──────────────────────────────────────────────────────────────
  PROFILE_GET:          'bf:profile:get',
  PROFILE_UPDATE:       'bf:profile:update',

  // ── Settings ─────────────────────────────────────────────────────────────
  SETTINGS_GET:         'bf:settings:get',
  SETTINGS_SET:         'bf:settings:set',
  FLAGS_GET_ALL:        'bf:flags:getAll',
  FLAGS_SET:            'bf:flags:set',

  // ── Collection — Sets ────────────────────────────────────────────────────
  SETS_LIST:            'bf:sets:list',
  SETS_GET:             'bf:sets:get',
  SETS_UPSERT:          'bf:sets:upsert',
  SETS_DELETE:          'bf:sets:delete',
  SETS_SEARCH_REBRICK:  'bf:sets:searchRebrickable',
  SETS_IMPORT_REBRICK:  'bf:sets:importRebrickable',

  // ── Collection — Minifigures ─────────────────────────────────────────────
  FIGS_LIST:            'bf:figs:list',
  FIGS_GET:             'bf:figs:get',
  FIGS_UPSERT:          'bf:figs:upsert',
  FIGS_DELETE:          'bf:figs:delete',

  // ── Collection — Pieces ──────────────────────────────────────────────────
  PIECES_LIST:          'bf:pieces:list',
  PIECES_UPSERT:        'bf:pieces:upsert',

  // ── Catalog Browser ──────────────────────────────────────────────────────
  CATALOG_BROWSE_SETS:    'bf:catalog:browseSets',
  CATALOG_BROWSE_MINIFIGS:'bf:catalog:browseMinifigs',
  CATALOG_THEMES:         'bf:catalog:themes',
  CATALOG_OWNED_NUMS:     'bf:catalog:ownedNums',
  CATALOG_ADD_SET:        'bf:catalog:addSet',
  CATALOG_ADD_FIG:        'bf:catalog:addFig',
  CATALOG_INSPECT_SET:    'bf:catalog:inspectSet',

  // ── Value Tracking ───────────────────────────────────────────────────────
  PRICE_HISTORY_GET:        'bf:price:history',
  PRICE_FETCH_CURRENT:      'bf:price:fetchCurrent',
  PRICE_GET_BULK:           'bf:price:getBulk',
  PRICE_PORTFOLIO_STATS:    'bf:price:portfolioStats',
  PRICE_REFRESH_COLLECTION: 'bf:price:refreshCollection',
  PRICE_ALERTS_LIST:        'bf:price:alertsList',
  PRICE_ALERTS_SET:         'bf:price:alertsSet',
  PRICE_FETCH_FIG:          'bf:price:fetchFig',
  PRICE_GET_BULK_FIGS:      'bf:price:getBulkFigs',
  PRICE_REFRESH_FIGS:       'bf:price:refreshFigs',

  // ── AI (direct Node.js calls — no sidecar) ──────────────────────────────
  AI_PICTURE_LOOKUP:    'bf:ai:pictureLookup',
  AI_PIECE_IDENTIFY:    'bf:ai:pieceIdentify',
  AI_BUILDER_GENERATE:  'bf:ai:builderGenerate',

  // ── eBay Listing Generator ───────────────────────────────────────────────
  LISTING_IDENTIFY_SET:      'bf:listing:identifySet',
  LISTING_GENERATE:          'bf:listing:generate',
  LISTING_HISTORY_LIST:      'bf:listing:historyList',
  LISTING_HISTORY_DELETE:    'bf:listing:historyDelete',
  SETS_LOOKUP_REBRICK:       'bf:sets:lookupRebrickable',
  SETS_MINIFIG_COUNT_REBRICK:'bf:sets:minifigCountRebrickable',

  // ── App ──────────────────────────────────────────────────────────────────
  APP_VERSION:          'bf:app:version',
  APP_OPEN_EXTERNAL:    'bf:app:openExternal',
  APP_SHOW_SAVE_DIALOG: 'bf:app:saveDialog',

  // ── Auto-update ──────────────────────────────────────────────────────────
  UPDATE_INSTALL:       'bf:update:install',
  UPDATE_CHECK:         'bf:update:check',
  UPDATE_GET_STATE:     'bf:update:getState',
  UPDATE_DOWNLOAD:      'bf:update:download',

  // ── Push events (main → renderer) ───────────────────────────────────────
  PUSH_PRICE_UPDATED:      'bf:push:priceUpdated',
  PUSH_AI_PROGRESS:        'bf:push:aiProgress',
  PUSH_UPDATE_AVAILABLE:   'bf:push:updateAvailable',
  PUSH_UPDATE_PROGRESS:    'bf:push:updateProgress',
  PUSH_UPDATE_DOWNLOADED:  'bf:push:updateDownloaded',
  PUSH_UPDATE_ERROR:       'bf:push:updateError',
} as const

export type IpcChannel = typeof IPC[keyof typeof IPC]

// ── Window globals (typed) ───────────────────────────────────────────────────
declare global {
  interface Window {
    ipc: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (channel: string, fn: (...args: unknown[]) => void) => () => void
      send: (channel: string, ...args: unknown[]) => void
    }
    appInfo: {
      platform: string
      version: string
    }
  }
}
