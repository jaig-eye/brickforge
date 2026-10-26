/**
 * Optional sync with your own Postgres database (Supabase, Neon, or a server
 * of your own), so two PCs can share one collection.
 *
 * The local database stays the real store: nothing waits on the network,
 * edits made offline queue up in _sync_meta, and the background loop catches
 * up when it can. This module owns the connection string, this PC's device
 * id, the timers and the status the UI shows; sync-engine.ts moves the rows.
 * In the status, pushed/pulled count what the most recent sync moved.
 */
import crypto from 'crypto'
import pg from 'pg'
import { IPC } from '../../src/lib/ipc-types'
import { AppError } from '../../src/lib/errors'
import type { SyncStatus } from '../../src/lib/types'
import log from '../main/logger'
import { isDemo } from '../main/paths'
import { getDb } from '../db/index'
import { readSettings, writeSettings, setSecret } from '../main/settings-store'
import { push } from './notify'
import { ensureRemoteSchema, prepareFullSync, syncOnce, pendingCount, changeMarker, type Queryable } from './sync-engine'
import { connectionConfig, describeServer, errorCode, friendlyError } from './sync-connection'

const SYNC_EVERY_MS = 60_000
const WATCH_EVERY_MS = 3_000
const AFTER_CHANGE_MS = 5_000
const AFTER_START_MS = 3_000

type RunState = Pick<SyncStatus, 'state' | 'lastSyncAt' | 'lastError' | 'pushed' | 'pulled'>
const FRESH: RunState = { state: 'idle', lastSyncAt: null, lastError: null, pushed: 0, pulled: 0 }

let run: RunState = { ...FRESH }
let pool: pg.Pool | null = null
let inFlight: Promise<void> | null = null
let timers: NodeJS.Timeout[] = [] // intervals and the start-up timeout; clearInterval clears either
let soon: NodeJS.Timeout | null = null
let lastMarker = ''

const isEnabled = () => {
  const s = readSettings()
  return s.syncEnabled === true && !!s.syncDatabaseUrl
}

function localPending(): number {
  try { return pendingCount(getDb()) } catch { return 0 }
}

function marker(): string {
  try { return changeMarker(getDb()) } catch { return '' }
}

export function syncStatus(): SyncStatus {
  const enabled = isEnabled()
  return {
    enabled,
    configured: !!readSettings().syncDatabaseUrl,
    state: enabled ? run.state : 'off',
    lastSyncAt: run.lastSyncAt,
    lastError: enabled ? run.lastError : null,
    pushed: run.pushed,
    pulled: run.pulled,
    pending: enabled ? localPending() : 0,
  }
}

function emit(): void {
  push(IPC.PUSH_SYNC, syncStatus())
}

/** A random id for this PC, created once; ties between PCs go to the larger id. */
function deviceId(): string {
  const id = readSettings().syncDeviceId
  if (id && /^[\w-]{8,64}$/.test(id)) return id
  const fresh = crypto.randomBytes(16).toString('hex')
  writeSettings({ syncDeviceId: fresh })
  return fresh
}

// ── Connection ───────────────────────────────────────────────────────────────

function getPool(): pg.Pool {
  if (pool) return pool
  const url = readSettings().syncDatabaseUrl
  if (!url) throw new AppError({ code: 'missing_key', service: 'postgres', message: 'Add a database connection string in Settings to sync.' })
  // One connection, closed when idle: the loop only needs it a few seconds a minute
  pool = new pg.Pool({ ...connectionConfig(url), max: 1, idleTimeoutMillis: 20_000 })
  pool.on('error', (err) => log.warn('[sync] idle database connection dropped:', errorCode(err)))
  return pool
}

async function closePool(): Promise<void> {
  const p = pool
  pool = null
  if (p) await p.end().catch(() => undefined)
}

async function withConnection<T>(fn: (remote: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  // pg emits 'error' on a checked-out client whose socket dies; unheard, that
  // would crash the app. The running query fails with it as well.
  const onError = (err: Error) => log.warn('[sync] database connection dropped:', errorCode(err))
  client.on('error', onError)
  let broken = false
  try {
    return await fn(client)
  } catch (err) {
    broken = true // a timed-out or failed connection is never reused
    throw err
  } finally {
    client.removeListener('error', onError)
    client.release(broken)
  }
}

/** A one-off connection for checking a URL before it is saved. */
async function withUrl<T>(url: string, fn: (remote: Queryable) => Promise<T>): Promise<T> {
  const client = new pg.Client(connectionConfig(url))
  client.on('error', () => undefined) // reported through the awaited call instead
  try {
    await client.connect()
    return await fn(client)
  } catch (err) {
    throw friendlyError(err)
  } finally {
    await client.end().catch(() => undefined)
  }
}

/** Settings → Test connection for a database URL. */
export async function testSyncUrl(url: string): Promise<string> {
  return withUrl(url, async (remote) => {
    const { rows } = await remote.query<{ v: string }>('SELECT version() AS v')
    return describeServer(rows[0]?.v)
  })
}

// ── Running a sync ───────────────────────────────────────────────────────────

async function cycle(): Promise<void> {
  if (soon) clearTimeout(soon)
  soon = null
  run = { ...run, state: 'syncing' }
  emit()
  try {
    const db = getDb()
    const res = await withConnection((remote) => syncOnce(db, remote, deviceId()))
    run = { state: 'idle', lastSyncAt: new Date().toISOString(), lastError: null, pushed: res.pushed, pulled: res.pulled }
    if (res.rejected) log.warn(`[sync] skipped ${res.rejected} server rows that failed validation`)
    if (res.pulled) push(IPC.PUSH_DATA_CHANGED, { kind: 'all' })
  } catch (err) {
    const e = friendlyError(err)
    if (run.lastError !== e.message) log.warn(`[sync] failed (${errorCode(err)}): ${e.message}`) // once per outage, not every minute
    run = { ...run, state: 'error', lastError: e.message }
    throw e
  } finally {
    lastMarker = marker()
    emit()
  }
}

/** One sync at a time; callers that arrive mid-sync share it. */
function runOnce(): Promise<void> {
  inFlight ??= cycle().finally(() => { inFlight = null })
  return inFlight
}

const background = () => void runOnce().catch(() => undefined) // recorded in the status

/** Local edits waiting? Sync shortly after they stop coming. */
function watch(): void {
  if (inFlight) return
  const m = marker()
  if (m === lastMarker) return
  lastMarker = m
  emit() // the pending count changed
  if (m.startsWith('0:')) return
  if (soon) clearTimeout(soon)
  soon = setTimeout(background, AFTER_CHANGE_MS)
  soon.unref?.()
}

function startLoop(syncFirst: boolean): void {
  if (timers.length) return
  lastMarker = marker()
  timers = [setInterval(background, SYNC_EVERY_MS), setInterval(watch, WATCH_EVERY_MS)]
  if (syncFirst) timers.push(setTimeout(background, AFTER_START_MS))
  for (const t of timers) t.unref?.()
}

function stopLoop(): void {
  for (const t of timers) clearInterval(t)
  timers = []
  if (soon) clearTimeout(soon)
  soon = null
}

/** Background sync while it's enabled: on start, every minute, and soon after local edits. */
export function startSync(): void {
  if (!isEnabled()) return
  startLoop(true)
}

export function stopSync(): void {
  stopLoop()
  void closePool()
}

/** Wait for a sync that's already running, then stop using the connection. */
async function settle(): Promise<void> {
  stopLoop()
  await inFlight?.catch(() => undefined)
  await closePool()
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * Connect, disconnect and "Sync now" run one after another: a sync that
 * slipped in mid-connect could otherwise mark rows as sent to the old database.
 */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn)
  queue = next.catch(() => undefined)
  return next
}

/**
 * Connect a database: check it, create the sync table if needed, save the
 * URL (encrypted), then run a full first sync of everything on this PC.
 */
export function connectSync(url: string): Promise<SyncStatus> {
  return serial(async () => {
    if (isDemo) {
      throw new AppError({ code: 'invalid_input', service: 'postgres', message: 'Sync is off in the sample collection, so it never mixes with yours.' })
    }
    const clean = url.trim()
    await withUrl(clean, async (remote) => {
      await remote.query('SELECT 1')
      await ensureRemoteSchema(remote)
    })
    await settle()
    setSecret('sync', clean)
    writeSettings({ syncEnabled: true })
    deviceId()
    prepareFullSync(getDb())
    run = { ...FRESH }
    try {
      await runOnce()
    } finally {
      startLoop(false)
    }
    return syncStatus()
  })
}

export function syncNow(): Promise<SyncStatus> {
  return serial(async () => {
    if (!isEnabled()) return syncStatus()
    await inFlight?.catch(() => undefined) // it may have started before the latest edits
    await runOnce()
    return syncStatus()
  })
}

/** Stop syncing and forget the URL. Data on this PC and on the server is kept. */
export function disconnectSync(): Promise<SyncStatus> {
  return serial(async () => {
    await settle()
    setSecret('sync', '')
    writeSettings({ syncEnabled: false })
    run = { ...FRESH }
    emit()
    return syncStatus()
  })
}

/**
 * After a backup is restored: this PC rejoins as a new device and resyncs
 * everything, so the restored file and the database converge — for each item
 * the newest edit wins, wherever it was made.
 */
export function resyncAfterRestore(): Promise<void> {
  return serial(async () => {
    if (!isEnabled()) return
    await settle()
    writeSettings({ syncDeviceId: crypto.randomBytes(16).toString('hex') })
    prepareFullSync(getDb())
    run = { ...FRESH }
    startLoop(true)
    emit()
  })
}
