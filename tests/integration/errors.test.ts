/**
 * Failures cross IPC as typed errors, and keys stay secret: they travel only
 * in auth headers, never reach the renderer, and are encrypted on disk.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createTestEnv, type TestEnv } from '../helpers/env'
import { VALID_KEYS } from '../helpers/fake-apis'
import { IPC } from '../../src/lib/ipc-types'
import type { AddResult, LegoSet, PublicSettings } from '../../src/lib/types'

let env: TestEnv
const settingsFile = () => JSON.parse(fs.readFileSync(path.join(env.dir, 'settings.json'), 'utf8')) as Record<string, unknown>

const SECRETS = {
  rebrickable: VALID_KEYS.rebrickable,
  bricklink: {
    bricklinkConsumerKey: VALID_KEYS.bricklinkConsumer,
    bricklinkConsumerSecret: 'bl-consumer-secret-0042',
    bricklinkToken: 'bl-token-value-0042',
    bricklinkTokenSecret: 'bl-token-secret-0042',
  },
  openai: VALID_KEYS.openai,
  anthropic: VALID_KEYS.anthropic,
  sync: 'postgres://brick:hunter2-password@db.example.com:5432/bricks',
}
const SECRET_STRINGS = [
  SECRETS.rebrickable, ...Object.values(SECRETS.bricklink), SECRETS.openai, SECRETS.anthropic, SECRETS.sync, 'hunter2-password',
]

beforeAll(async () => { env = await createTestEnv() })
afterAll(() => env?.close())

describe('service errors', () => {
  it('without a Rebrickable key, adding a set asks for one and sends nothing', async () => {
    const res = await env.invoke(IPC.ADD_SET, '75192', { as: 'owned' })
    expect(res).toMatchObject({ ok: false, error: { code: 'missing_key', service: 'rebrickable' } })
    expect(await env.invoke(IPC.CATALOG_SETS, { search: 'falcon' })).toMatchObject({ ok: false, error: { code: 'missing_key', service: 'rebrickable' } })
    expect(env.apis.requests.filter((r) => r.service === 'rebrickable')).toHaveLength(0)
  })

  it('a key Rebrickable rejects comes back as an auth error', async () => {
    await env.call(IPC.SETTINGS_SET_SECRET, 'rebrickable', 'not-a-real-key')
    const res = await env.invoke(IPC.ADD_SET, '75192', { as: 'owned' })
    expect(res).toMatchObject({ ok: false, error: { code: 'auth', service: 'rebrickable' } })
    const test = await env.invoke(IPC.SETTINGS_TEST, 'rebrickable')
    expect(test).toMatchObject({ ok: false, error: { code: 'auth' } })
  })

  it('a set the catalog does not have is not_found', async () => {
    await env.call(IPC.SETTINGS_SET_SECRET, 'rebrickable', VALID_KEYS.rebrickable)
    const res = await env.invoke(IPC.ADD_SET, '99999', { as: 'owned' })
    expect(res).toMatchObject({ ok: false, error: { code: 'not_found', service: 'rebrickable' } })
    expect(await env.invoke(IPC.CATALOG_SET_DETAIL, '99999-1')).toMatchObject({ ok: false, error: { code: 'not_found' } })
  })

  it('a server error is retried, and the retry succeeds', async () => {
    let hits = 0
    const undo = env.apis.override((req) => {
      if (req.service !== 'rebrickable' || req.path !== '/sets/10497-1/') return undefined
      hits++
      return hits === 1 ? { status: 500, text: 'upstream timeout' } : undefined
    })
    try {
      const { item, outcome } = await env.call<AddResult<LegoSet>>(IPC.ADD_SET, '10497', { as: 'owned' })
      expect(outcome).toBe('added')
      expect(item.name).toBe('Galaxy Explorer')
      expect(hits).toBe(2)
    } finally {
      undo()
    }
  })

  it('sends the Rebrickable key in the Authorization header, never in the URL', async () => {
    const sent = env.apis.requests.filter((r) => r.service === 'rebrickable')
    expect(sent.length).toBeGreaterThan(0)
    for (const r of sent) {
      expect(r.headers.authorization).toMatch(/^key /)
      expect(`${r.path}?${r.query.toString()}`).not.toContain(VALID_KEYS.rebrickable)
      expect(`${r.path}?${r.query.toString()}`).not.toContain('not-a-real-key')
      expect([...r.query.keys()]).not.toContain('key')
    }
  })

  it('a provider that rejects the AI key is an auth error', async () => {
    expect(await env.invoke(IPC.SETTINGS_TEST, 'anthropic', 'sk-ant-wrong')).toMatchObject({ ok: false, error: { code: 'auth', service: 'anthropic' } })
    expect(await env.invoke(IPC.SETTINGS_TEST, 'openai', 'sk-wrong')).toMatchObject({ ok: false, error: { code: 'auth', service: 'openai' } })
    expect(await env.invoke(IPC.SETTINGS_TEST, 'anthropic', VALID_KEYS.anthropic)).toMatchObject({ ok: true })
    expect(await env.invoke(IPC.SETTINGS_TEST, 'openai', VALID_KEYS.openai)).toMatchObject({ ok: true })
  })

  it('tests BrickLink keys before they are saved', async () => {
    const bad = await env.invoke(IPC.SETTINGS_TEST, 'bricklink', { ...SECRETS.bricklink, bricklinkConsumerKey: 'wrong' })
    expect(bad).toMatchObject({ ok: false, error: { code: 'auth', service: 'bricklink' } })
    expect(await env.invoke(IPC.SETTINGS_TEST, 'bricklink', SECRETS.bricklink)).toMatchObject({ ok: true })
    const partial = await env.invoke(IPC.SETTINGS_TEST, 'bricklink', { bricklinkConsumerKey: 'x' })
    expect(partial).toMatchObject({ ok: false, error: { code: 'missing_key', service: 'bricklink' } })
  })
})

describe('secrets', () => {
  it('SETTINGS_GET says which keys are set but never returns a key', async () => {
    await env.call(IPC.SETTINGS_SET_SECRET, 'rebrickable', SECRETS.rebrickable)
    await env.call(IPC.SETTINGS_SET_SECRET, 'bricklink', SECRETS.bricklink)
    await env.call(IPC.SETTINGS_SET_SECRET, 'openai', SECRETS.openai)
    await env.call(IPC.SETTINGS_SET_SECRET, 'anthropic', SECRETS.anthropic)
    await env.call(IPC.SETTINGS_SET_SECRET, 'sync', SECRETS.sync)

    const s = await env.call<PublicSettings>(IPC.SETTINGS_GET)
    const json = JSON.stringify(s)
    for (const secret of SECRET_STRINGS) expect(json).not.toContain(secret)
    for (const name of ['rebrickable', 'bricklink', 'openai', 'anthropic', 'sync'] as const) {
      expect(s.keys[name]).toMatchObject({ set: true, partial: false })
      expect(s.keys[name].hint).toBeTruthy()
    }
    expect(s.keys.rebrickable.hint).toBe('…-key')
    expect(s.keys.sync.hint).toBe('db.example.com/bricks')
  })

  it('SETTINGS_SET_SECRET answers with public settings only', async () => {
    const s = await env.call<PublicSettings>(IPC.SETTINGS_SET_SECRET, 'anthropic', SECRETS.anthropic)
    expect(JSON.stringify(s)).not.toContain(SECRETS.anthropic)
  })

  it('stores every secret encrypted on disk', () => {
    const raw = fs.readFileSync(path.join(env.dir, 'settings.json'), 'utf8')
    for (const secret of SECRET_STRINGS) expect(raw).not.toContain(secret)
    const file = settingsFile()
    for (const field of ['rebrickableApiKey', 'bricklinkConsumerKey', 'bricklinkConsumerSecret', 'bricklinkToken', 'bricklinkTokenSecret', 'openaiApiKey', 'anthropicApiKey', 'syncDatabaseUrl']) {
      expect(String(file[field]), field).toMatch(/^enc:[A-Za-z0-9+/]+=*$/)
    }
  })

  it('reports a partly entered BrickLink key set as partial, and clears a key with an empty value', async () => {
    const partial = await env.call<PublicSettings>(IPC.SETTINGS_SET_SECRET, 'bricklink', { bricklinkConsumerKey: VALID_KEYS.bricklinkConsumer, bricklinkToken: 'tok-1234' })
    expect(partial.keys.bricklink).toMatchObject({ set: false, partial: true })
    const cleared = await env.call<PublicSettings>(IPC.SETTINGS_SET_SECRET, 'openai', '   ')
    expect(cleared.keys.openai).toEqual({ set: false, partial: false, hint: null })
    expect(settingsFile().openaiApiKey).toBe('')
  })

  it('refuses a secret name it does not know', async () => {
    expect(await env.invoke(IPC.SETTINGS_SET_SECRET, 'aws', 'AKIA...')).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
    expect(settingsFile()).not.toHaveProperty('aws')
  })
})

describe('preferences', () => {
  it('applies valid preferences and ignores unknown keys and bad values', async () => {
    const before = await env.call<PublicSettings>(IPC.SETTINGS_GET)
    const storedKey = settingsFile().rebrickableApiKey
    const s = await env.call<PublicSettings>(IPC.SETTINGS_SET_PREFS, {
      accent: 'red',
      displayName: '  Jai  ',
      theme: 'purple',
      reduceMotion: true,
      autoRefreshPrices: 'yes',
      onboardingDone: 1,
      bogus: 'x',
      aiProvider: 'openai',
      rebrickableApiKey: 'stolen?',
      lastPriceRefreshAt: '2000-01-01',
    })
    expect(s).toMatchObject({ accent: 'red', displayName: 'Jai', theme: before.theme, reduceMotion: before.reduceMotion, autoRefreshPrices: before.autoRefreshPrices, onboardingDone: before.onboardingDone, aiProvider: before.aiProvider })
    expect(s.lastPriceRefreshAt).toBe(before.lastPriceRefreshAt)
    const file = settingsFile()
    for (const k of ['bogus', 'aiProvider', 'lastPriceRefreshAt', 'theme', 'reduceMotion']) expect(file, k).not.toHaveProperty(k)
    // A secret can't be written through the preferences channel
    expect(file.rebrickableApiKey).toBe(storedKey)
    expect(await env.invoke(IPC.SETTINGS_TEST, 'rebrickable')).toMatchObject({ ok: true })
  })

  it('rejects a display name over 60 characters', async () => {
    const s = await env.call<PublicSettings>(IPC.SETTINGS_SET_PREFS, { displayName: 'x'.repeat(61) })
    expect(s.displayName).toBe('Jai')
  })

  it('ignores keys inherited from Object.prototype', async () => {
    const patch = JSON.parse('{"constructor": "x", "toString": "x", "valueOf": 1, "hasOwnProperty": "x", "__proto__": {"theme": "light"}, "accent": "blue"}')
    const res = await env.invoke<PublicSettings>(IPC.SETTINGS_SET_PREFS, patch)
    expect(res).toMatchObject({ ok: true, data: { accent: 'blue' } })
    const file = settingsFile()
    for (const k of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) expect(Object.prototype.hasOwnProperty.call(file, k), k).toBe(false)
    expect(file.theme).toBeUndefined()
  })
})
