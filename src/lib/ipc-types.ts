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

  // ── Value Tracking ───────────────────────────────────────────────────────
  PRICE_HISTORY_GET:    'bf:price:history',
  PRICE_FETCH_CURRENT:  'bf:price:fetchCurrent',
  PRICE_ALERTS_LIST:    'bf:price:alertsList',
  PRICE_ALERTS_SET:     'bf:price:alertsSet',

  // ── AI (proxied to sidecar) ──────────────────────────────────────────────
  AI_PICTURE_LOOKUP:    'bf:ai:pictureLookup',
  AI_PIECE_IDENTIFY:    'bf:ai:pieceIdentify',
  AI_BUILDER_GENERATE:  'bf:ai:builderGenerate',

  // ── Sidecar lifecycle ────────────────────────────────────────────────────
  SIDECAR_STATUS:       'bf:sidecar:status',
  SIDECAR_RESTART:      'bf:sidecar:restart',

  // ── App ──────────────────────────────────────────────────────────────────
  APP_VERSION:          'bf:app:version',
  APP_OPEN_EXTERNAL:    'bf:app:openExternal',
  APP_SHOW_SAVE_DIALOG: 'bf:app:saveDialog',

  // ── Push events (main → renderer) ───────────────────────────────────────
  PUSH_SIDECAR_READY:   'bf:push:sidecarReady',
  PUSH_SIDECAR_DOWN:    'bf:push:sidecarDown',
  PUSH_PRICE_UPDATED:   'bf:push:priceUpdated',
  PUSH_AI_PROGRESS:     'bf:push:aiProgress',
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
