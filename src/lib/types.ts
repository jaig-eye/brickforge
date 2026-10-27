/**
 * Domain types shared by the main process and the renderer — the contract
 * every IPC channel speaks. No runtime code lives here.
 */
import type { AiProviderId } from './ai-models'
import type { FigCondition, SetCondition } from './conditions'
import type { AppErrorCode } from './errors'

export type EntityKind = 'set' | 'minifig'
export type PriceCondition = 'new' | 'used'

// ── Collection ────────────────────────────────────────────────────────────────

export interface LegoSet {
  id: number
  set_number: string
  name: string
  year: number | null
  theme: string | null
  piece_count: number | null
  retail_price_usd: number | null
  image_url: string | null
  rebrickable_url: string | null
  bricklink_url: string | null
  notes: string | null
  is_owned: 0 | 1
  is_wanted: 0 | 1
  condition: SetCondition
  acquired_date: string | null
  acquired_price: number | null
  quantity: number
  has_box: 0 | 1 | null
  has_instructions: 0 | 1 | null
  missing_parts: string | null
  created_at: string
  updated_at: string
}

export interface Minifigure {
  id: number
  fig_number: string
  name: string
  character: string | null
  theme: string | null
  year: number | null
  image_url: string | null
  bricklink_url: string | null
  bricklink_id: string | null
  /** Its Rebrickable number (fig-…), for the catalog's pictures and set lists */
  rebrickable_id: string | null
  notes: string | null
  is_owned: 0 | 1
  is_wanted: 0 | 1
  quantity: number
  condition: FigCondition
  acquired_price: number | null
  acquired_date: string | null
  created_at: string
  updated_at: string
}

/** A collection row decorated with its latest condition-matched market price. */
export type Priced<T> = T & {
  market_price: number | null
  market_source: 'sold' | 'stock' | null
  market_at: string | null
  tags: string[]
}

export type CollectionSet = Priced<LegoSet>
export type CollectionFig = Priced<Minifigure>

export type CollectionSort = 'added' | 'name' | 'year' | 'number' | 'value' | 'paid' | 'gain' | 'theme' | 'pieces'

export interface CollectionQuery {
  scope?: 'owned' | 'wanted' | 'all'
  search?: string
  theme?: string
  condition?: string
  tag?: string
  sort?: CollectionSort
  dir?: 'asc' | 'desc'
}

/** Fields the user edits on an owned or wanted set. */
export interface SetPatch {
  name?: string
  notes?: string | null
  is_owned?: 0 | 1
  is_wanted?: 0 | 1
  condition?: SetCondition
  acquired_date?: string | null
  acquired_price?: number | null
  quantity?: number
  has_box?: 0 | 1 | null
  has_instructions?: 0 | 1 | null
  missing_parts?: string | null
}

export interface FigPatch {
  name?: string
  character?: string | null
  notes?: string | null
  is_owned?: 0 | 1
  is_wanted?: 0 | 1
  condition?: FigCondition
  acquired_date?: string | null
  acquired_price?: number | null
  quantity?: number
  bricklink_id?: string | null
}

/** How an item enters the collection. */
export interface AddOptions {
  as: 'owned' | 'wanted'
  condition?: string
  acquired_price?: number | null
  quantity?: number
  notes?: string | null
}

export interface AddResult<T> {
  item: T
  /** 'added' = new row; 'copy' = owned again, quantity went up; 'moved' = wishlist → owned; 'exists' = no change. */
  outcome: 'added' | 'copy' | 'moved' | 'exists'
}

export interface Tag {
  id: number
  name: string
  color: string | null
  item_count: number
}

export interface OwnershipIndex {
  owned: string[]
  wanted: string[]
}

// ── Catalog (Rebrickable) ────────────────────────────────────────────────────

export interface CatalogSet {
  set_num: string
  name: string
  year: number
  theme_id: number
  num_parts: number
  set_img_url: string | null
  set_url: string
}

export interface CatalogFig {
  set_num: string
  name: string
  num_parts: number
  set_img_url: string | null
}

export interface CatalogTheme {
  id: number
  parent_id: number | null
  name: string
}

export interface CatalogPage<T> {
  count: number
  results: T[]
}

export interface CatalogSetDetail {
  set: CatalogSet
  theme: string | null
  /** From the set's BrickLink inventory when there are BrickLink keys (then set_num is the BrickLink id), else Rebrickable */
  minifigs: { set_num: string; set_name: string; quantity: number; set_img_url: string | null; bricklink_id?: string }[]
}

// ── Prices ────────────────────────────────────────────────────────────────────

export interface PricePoint {
  id: number
  entity_type: EntityKind
  entity_id: string
  source: string
  condition: PriceCondition
  avg_price: number
  min_price: number | null
  max_price: number | null
  sample_count: number | null
  currency: string
  recorded_at: string
  day: string
}

export interface PortfolioSummary {
  /** Market value of everything owned that has a price, × quantity. */
  total_value: number
  set_value: number
  fig_value: number
  /** What was paid, for items with a purchase price (× quantity). */
  cost_basis: number
  /** Gain on items that have BOTH a purchase price and a market price. */
  gain: number | null
  gain_pct: number | null
  gain_items: number
  sets_owned: number
  figs_owned: number
  /** Distinct owned rows with a market price / without one. */
  priced_items: number
  unpriced_items: number
  wanted_count: number
  last_priced_at: string | null
}

export interface PortfolioHistoryPoint {
  day: string
  set_value: number
  fig_value: number
  total: number
}

export interface Mover {
  entity_type: EntityKind
  entity_id: string
  name: string | null
  image_url: string | null
  condition: PriceCondition
  latest: number
  previous: number
  delta: number
  pct: number
  since: string
}

export type AlertDirection = 'below' | 'above'

export interface PriceAlert {
  id: number
  entity_type: EntityKind
  entity_id: string
  target_price: number
  condition: PriceCondition
  direction: AlertDirection
  is_active: 0 | 1
  triggered_at: string | null
  created_at: string
  // joined for display
  name?: string | null
  image_url?: string | null
  current_price?: number | null
}

export interface TriggeredAlert extends PriceAlert {
  current_price: number
  name: string | null
}

export interface RefreshStatus {
  running: boolean
  done: number
  total: number
  current: string | null
  refreshed: number
  failed: number
  /** Last few failures, for the "details" view. */
  errors: { id: string; message: string; code?: AppErrorCode }[]
  startedAt: string | null
  finishedAt: string | null
  reason: 'manual' | 'scheduled' | null
}

// ── Scan ──────────────────────────────────────────────────────────────────────

export type ScanType = 'minifig' | 'set'
export type ScanStatus = 'queued' | 'running' | 'done' | 'error' | 'added' | 'dismissed'

export interface ScanJob {
  id: number
  scan_type: ScanType
  image_hash: string | null
  status: ScanStatus
  confidence: number | null
  error: string | null
  is_crop: 0 | 1
  split_pending: 0 | 1
  created_at: string
  updated_at: string
  /** Parsed result for done jobs (shape depends on scan_type). */
  result: FigIdentifyResult | SetIdentifyResult | null
}

export interface FigMatch {
  fig_number: string
  name: string
  image_url: string | null
  confidence: number
  bricklink_id: string | null
  reason?: string
}

export interface FigIdentifyResult {
  matches: FigMatch[]
  description: string | null
  subject?: 'minifig' | 'set' | 'parts' | 'other'
  model_used: string
  error?: string
}

export interface SetCandidate {
  set_num: string
  name: string
  year: number | null
  num_parts: number | null
  set_img_url: string | null
  score: number
  source: 'visual' | 'search'
}

export interface SetIdentifyResult {
  set_number: string | null
  set_name: string | null
  confidence: number
  notes: string | null
  /** True only when an AI judged real candidates against the photo. */
  verified: boolean
  rb: { set_num: string; name: string; year: number; num_parts: number; set_img_url: string | null; theme: string | null } | null
  candidates: SetCandidate[]
  set_number_visible?: boolean
  model_used: string
  error?: string
}

export interface PieceMatch {
  name: string
  part_number: string | null
  color: string | null
  confidence: number
  bricklink_url: string | null
  img_url: string | null
}

export interface PieceIdentifyResult {
  pieces: PieceMatch[]
  model_used: string
  error?: string
}

export interface ScanEvalStats {
  total: number
  confirmed: number
  accuracy: number | null
  bySource: { source: string | null; total: number; confirmed: number }[]
}

// ── Sell ──────────────────────────────────────────────────────────────────────

export interface ListingInput {
  set_number: string
  name: string
  year: number | null
  theme: string | null
  piece_count: number | null
  minifig_count: number
}

export interface ListingPrefs {
  completeness: 'complete' | 'partial' | 'incomplete'
  includes_instructions: boolean
  includes_figures: boolean
  includes_box: boolean
  smoke_free_home: boolean
  clean_set: boolean
  seller_notes: string | null
}

export interface ListingResult {
  id: number
  title: string
  /** Sanitized HTML, safe to paste into eBay. */
  description: string
}

export interface ListingHistoryEntry {
  id: number
  uid: string
  set_number: string
  set_name: string
  year: number | null
  title: string
  description: string
  provider: string | null
  created_at: string
}

export interface PriceSuggestion {
  condition: PriceCondition
  avg: number
  min: number | null
  max: number | null
  samples: number | null
  source: 'sold' | 'stock'
}

// ── Import / export ──────────────────────────────────────────────────────────

export interface ImportItem {
  kind: EntityKind
  number: string
  quantity: number
  wanted: boolean
  condition?: string
  price?: number | null
  notes?: string | null
  /** Details only a BrickForge export carries; left out when the file doesn't state them. */
  acquired_date?: string
  bricklink_id?: string
  has_box?: boolean
  has_instructions?: boolean
  missing_parts?: string
  tags?: string[]
}

export interface ImportPreview {
  canceled: boolean
  format?: string
  fileName?: string
  items?: ImportItem[]
  skipped?: number
}

export interface ImportResult {
  imported: number
  updated: number
  failed: { number: string; reason: string }[]
}

export interface ImportProgress {
  done: number
  total: number
  current: string | null
}

export interface BackupInfo {
  name: string
  size: number
  mtime: string
  label: string
}

// ── Settings / app ───────────────────────────────────────────────────────────

export type SecretName = 'rebrickable' | 'bricklink' | 'openai' | 'anthropic' | 'sync'

export interface Preferences {
  displayName?: string
  theme?: 'dark' | 'light' | 'system'
  accent?: 'yellow' | 'red' | 'blue' | 'green'
  reduceMotion?: 'system' | 'on' | 'off'
  autoRefreshPrices?: boolean
  onboardingDone?: boolean
  syncEnabled?: boolean
}

export interface PublicSettings extends Required<Preferences> {
  aiProvider: AiProviderId
  aiModel: string | null
  keys: Record<SecretName, { set: boolean; partial: boolean; hint: string | null }>
  lastPriceRefreshAt: string | null
}

export type TestableService = 'rebrickable' | 'bricklink' | 'openai' | 'anthropic' | 'claude-code' | 'brickognize' | 'sync'

export interface AppInfo {
  version: string
  platform: string
  packaged: boolean
  demo: boolean
  dataDir: string
}

export interface DataHealth {
  figsMissingBlId: number
  figsMissingDetails: number
  setsMissingTheme: number
}

export type UpdateState =
  | { status: 'unsupported' }
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date'; checkedAt: string }
  /** url: where to download it by hand (macOS, where the app can't update itself unsigned) */
  | { status: 'available'; version: string; notes: string | null; url?: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export interface SyncStatus {
  enabled: boolean
  configured: boolean
  state: 'off' | 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  lastError: string | null
  pushed: number
  pulled: number
  pending: number
}
