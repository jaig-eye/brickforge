/**
 * Central settings store — the single reader/writer for userData/settings.json.
 *
 * Secrets (API keys, the sync database URL) are encrypted at rest with
 * Electron's safeStorage (DPAPI on Windows, Keychain on macOS) as
 * "enc:<base64>"; legacy plaintext values are read transparently and
 * re-encrypted on the next write. Secrets never leave the main process: the
 * renderer only ever sees publicSettings(), which says whether each key is set.
 */
import { app, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'
import log from './logger'
import type { AiProviderId } from '../../src/lib/ai-models'
import type { PublicSettings, Preferences, SecretName } from '../../src/lib/types'

export interface AppSettings extends Preferences {
  aiProvider?: AiProviderId
  aiModel?: string
  rebrickableApiKey?: string
  bricklinkConsumerKey?: string
  bricklinkConsumerSecret?: string
  bricklinkToken?: string
  bricklinkTokenSecret?: string
  openaiApiKey?: string
  anthropicApiKey?: string
  syncDatabaseUrl?: string
  // Internal state, not user-editable
  lastPriceRefreshAt?: string
  lastWeeklyBackupAt?: string
  syncDeviceId?: string
}

type SecretField =
  | 'rebrickableApiKey' | 'bricklinkConsumerKey' | 'bricklinkConsumerSecret' | 'bricklinkToken'
  | 'bricklinkTokenSecret' | 'openaiApiKey' | 'anthropicApiKey' | 'syncDatabaseUrl'

const SECRET_FIELDS: SecretField[] = [
  'rebrickableApiKey',
  'bricklinkConsumerKey', 'bricklinkConsumerSecret', 'bricklinkToken', 'bricklinkTokenSecret',
  'openaiApiKey', 'anthropicApiKey', 'syncDatabaseUrl',
]

/** Which stored fields make up each user-facing secret. */
export const SECRET_GROUPS: Record<SecretName, SecretField[]> = {
  rebrickable: ['rebrickableApiKey'],
  bricklink: ['bricklinkConsumerKey', 'bricklinkConsumerSecret', 'bricklinkToken', 'bricklinkTokenSecret'],
  openai: ['openaiApiKey'],
  anthropic: ['anthropicApiKey'],
  sync: ['syncDatabaseUrl'],
}

export const DEFAULT_PREFERENCES: Required<Preferences> = {
  displayName: '',
  theme: 'dark',
  accent: 'yellow',
  reduceMotion: 'system',
  autoRefreshPrices: true,
  onboardingDone: false,
  syncEnabled: false,
}

const ENC_PREFIX = 'enc:'
let cache: { raw: Record<string, unknown>; decrypted: AppSettings } | null = null

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function canEncrypt(): boolean {
  try { return safeStorage.isEncryptionAvailable() } catch { return false }
}

/** Decrypt a stored value; null means "encrypted but undecryptable right now". */
function tryDecrypt(value: string): string | null {
  if (!value.startsWith(ENC_PREFIX)) return value // legacy plaintext
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'))
  } catch (err) {
    log.warn('[settings] failed to decrypt a stored secret — keeping the stored blob intact:', err)
    return null
  }
}

function encryptValue(value: string): string {
  if (!value || !canEncrypt()) return value
  try {
    return ENC_PREFIX + safeStorage.encryptString(value).toString('base64')
  } catch (err) {
    log.warn('[settings] encryption failed — storing plaintext:', err)
    return value
  }
}

function load(): { raw: Record<string, unknown>; decrypted: AppSettings } {
  if (cache) return cache
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
  } catch {
    raw = {}
  }
  const decrypted: Record<string, unknown> = { ...raw }
  for (const key of SECRET_FIELDS) {
    const v = raw[key]
    if (typeof v === 'string' && v) decrypted[key] = tryDecrypt(v) ?? ''
  }
  cache = { raw, decrypted: decrypted as AppSettings }
  return cache
}

function persist(merged: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  const tmp = `${settingsPath()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8')
  fs.renameSync(tmp, settingsPath()) // atomic: a crash mid-write can't truncate settings
  cache = null
}

/**
 * Encrypt any secret still stored in plain text (older versions only
 * encrypted a key when it was re-saved). Runs once at startup.
 */
export function sealPlaintextSecrets(): number {
  if (!canEncrypt()) return 0
  const { raw } = load()
  const merged: Record<string, unknown> = { ...raw }
  let sealed = 0
  for (const key of SECRET_FIELDS) {
    const v = raw[key]
    if (typeof v === 'string' && v && !v.startsWith(ENC_PREFIX)) {
      merged[key] = encryptValue(v)
      sealed++
    }
  }
  // Retired fields from the alpha releases
  for (const dead of ['sidecarPort']) {
    if (dead in merged) { delete merged[dead]; sealed++ }
  }
  if (sealed) persist(merged)
  return sealed
}

/** Settings with secrets decrypted — for main-process consumers only. */
export function readSettings(): AppSettings {
  return load().decrypted
}

/** Merge a patch, encrypting secret fields at rest. Main-process only. */
export function writeSettings(patch: Partial<AppSettings>): void {
  const { raw } = load()
  const merged: Record<string, unknown> = { ...raw, ...patch }
  for (const key of SECRET_FIELDS) {
    const incoming = (patch as Record<string, unknown>)[key]
    if (typeof incoming === 'string' && incoming) merged[key] = encryptValue(incoming.trim())
  }
  persist(merged)
}

/** Store or clear one user-facing secret. Values are trimmed; '' clears. */
export function setSecret(name: SecretName, value: string | Record<string, string>): void {
  const fields = SECRET_GROUPS[name]
  const merged: Record<string, unknown> = { ...load().raw }
  if (typeof value === 'string') {
    if (fields.length !== 1) throw new Error(`${name} needs ${fields.length} values`)
    merged[fields[0]] = value.trim() ? encryptValue(value.trim()) : ''
  } else {
    for (const f of fields) {
      const v = typeof value[f] === 'string' ? value[f].trim() : ''
      merged[f] = v ? encryptValue(v) : ''
    }
  }
  persist(merged)
}

function hint(v: string | undefined): string | null {
  if (!v) return null
  if (v.startsWith('postgres')) {
    try { const u = new URL(v); return `${u.hostname}${u.pathname}` } catch { return 'saved' }
  }
  return v.length > 8 ? `…${v.slice(-4)}` : 'saved'
}

/** Everything the renderer may see: preferences, AI choice, and which keys exist. */
export function publicSettings(): PublicSettings {
  const s = readSettings()
  const prefs = Object.fromEntries(
    Object.entries(DEFAULT_PREFERENCES).map(([k, d]) => [k, (s as Record<string, unknown>)[k] ?? d]),
  ) as Required<Preferences>
  const keys = Object.fromEntries(
    (Object.keys(SECRET_GROUPS) as SecretName[]).map((name) => {
      const values = SECRET_GROUPS[name].map((f) => s[f] ?? '')
      return [name, { set: values.every(Boolean), partial: values.some(Boolean) && !values.every(Boolean), hint: hint(values[0]) }]
    }),
  ) as PublicSettings['keys']
  return {
    ...prefs,
    aiProvider: s.aiProvider ?? 'anthropic',
    aiModel: s.aiModel ?? null,
    keys,
    lastPriceRefreshAt: s.lastPriceRefreshAt ?? null,
  }
}

const PREF_VALIDATORS: { [K in keyof Preferences]-?: (v: unknown) => boolean } = {
  displayName: (v) => typeof v === 'string' && v.length <= 60,
  theme: (v) => v === 'dark' || v === 'light' || v === 'system',
  accent: (v) => v === 'yellow' || v === 'red' || v === 'blue' || v === 'green',
  reduceMotion: (v) => v === 'system' || v === 'on' || v === 'off',
  autoRefreshPrices: (v) => typeof v === 'boolean',
  onboardingDone: (v) => typeof v === 'boolean',
  syncEnabled: (v) => typeof v === 'boolean',
}

/** Apply a preferences patch from the UI; unknown keys and bad values are ignored. */
export function setPreferences(patch: Record<string, unknown>): PublicSettings {
  const clean: Partial<AppSettings> = {}
  for (const [k, v] of Object.entries(patch ?? {})) {
    // Own keys only: "constructor", "toString" and friends are inherited from
    // Object.prototype, are callable, and would pass as validators
    const ok = Object.hasOwn(PREF_VALIDATORS, k) ? PREF_VALIDATORS[k as keyof Preferences] : undefined
    if (ok?.(v)) (clean as Record<string, unknown>)[k] = typeof v === 'string' ? v.trim() : v
  }
  if (Object.keys(clean).length) writeSettings(clean)
  return publicSettings()
}

/** Choose the AI provider and model. */
export function setAiChoice(provider: AiProviderId, model: string | null): PublicSettings {
  if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'claude-code') throw new Error('Unknown AI provider')
  writeSettings({ aiProvider: provider, aiModel: typeof model === 'string' ? model.trim().slice(0, 80) : undefined })
  return publicSettings()
}
