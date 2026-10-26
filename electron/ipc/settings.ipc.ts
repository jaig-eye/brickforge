import { IPC } from '../../src/lib/ipc-types'
import { AppError, missingKey } from '../../src/lib/errors'
import type { SecretName, TestableService } from '../../src/lib/types'
import {
  publicSettings, setPreferences, setAiChoice, setSecret, readSettings, SECRET_GROUPS,
} from '../main/settings-store'
import { testRebrickableKey } from '../api/rebrickable'
import { testBricklinkCredentials } from '../api/bricklink'
import { testAiKey } from '../api/ai'
import { isClaudeCodeAvailable } from '../api/claude-code'
import { testBrickognize } from '../api/brickognize'
import { testSyncUrl } from '../services/sync'
import { handle, obj, str } from './handle'

const SECRETS = Object.keys(SECRET_GROUPS) as SecretName[]

/**
 * Test a service with the keys given (not yet saved) or, when none are
 * given, the stored ones. Resolves on success; throws the AppError otherwise.
 */
async function testService(service: TestableService, candidate: unknown): Promise<{ ok: true; detail: string }> {
  const s = readSettings()
  switch (service) {
    case 'rebrickable': {
      const key = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : s.rebrickableApiKey
      if (!key) throw missingKey('rebrickable')
      await testRebrickableKey(key)
      return { ok: true, detail: 'Rebrickable accepted the key.' }
    }
    case 'bricklink': {
      const c = obj<Record<string, string>>(candidate)
      const creds = {
        consumerKey: c.bricklinkConsumerKey?.trim() || s.bricklinkConsumerKey || '',
        consumerSecret: c.bricklinkConsumerSecret?.trim() || s.bricklinkConsumerSecret || '',
        token: c.bricklinkToken?.trim() || s.bricklinkToken || '',
        tokenSecret: c.bricklinkTokenSecret?.trim() || s.bricklinkTokenSecret || '',
      }
      if (!Object.values(creds).every(Boolean)) throw missingKey('bricklink', 'all four BrickLink keys')
      await testBricklinkCredentials(creds)
      return { ok: true, detail: 'BrickLink accepted the keys.' }
    }
    case 'openai':
    case 'anthropic': {
      const key = typeof candidate === 'string' && candidate.trim() ? candidate.trim()
        : service === 'openai' ? s.openaiApiKey : s.anthropicApiKey
      await testAiKey(service, key ?? '')
      return { ok: true, detail: `${service === 'openai' ? 'OpenAI' : 'Anthropic'} accepted the key.` }
    }
    case 'claude-code': {
      if (!(await isClaudeCodeAvailable())) {
        throw new AppError({ code: 'missing_key', service: 'claude-code', message: "Claude Code isn't installed on this computer, or isn't on the PATH." })
      }
      return { ok: true, detail: 'Claude Code is installed.' }
    }
    case 'brickognize': {
      await testBrickognize()
      return { ok: true, detail: 'Brickognize is reachable.' }
    }
    case 'sync': {
      const url = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : s.syncDatabaseUrl
      if (!url) throw missingKey('postgres', 'a database connection string')
      return { ok: true, detail: await testSyncUrl(url) }
    }
    default:
      throw new AppError({ code: 'invalid_input', message: 'Unknown service.' })
  }
}

export function registerSettingsHandlers(): void {
  handle(IPC.SETTINGS_GET, () => publicSettings())
  handle(IPC.SETTINGS_SET_PREFS, (patch: unknown) => setPreferences(obj<Record<string, unknown>>(patch)))
  handle(IPC.SETTINGS_SET_AI, (provider: unknown, model?: unknown) =>
    setAiChoice(str(provider, 20) as 'anthropic', typeof model === 'string' ? model : null))
  handle(IPC.SETTINGS_SET_SECRET, (name: unknown, value: unknown) => {
    if (!SECRETS.includes(name as SecretName)) throw new AppError({ code: 'invalid_input', message: 'Unknown key.' })
    if (typeof value === 'string') setSecret(name as SecretName, value.slice(0, 2000))
    else {
      const v = obj<Record<string, string>>(value)
      setSecret(name as SecretName, Object.fromEntries(Object.entries(v).flatMap(([k, x]) => (typeof x === 'string' ? [[k, x.slice(0, 500)]] : []))))
    }
    return publicSettings()
  })
  handle(IPC.SETTINGS_TEST, (service: unknown, candidate?: unknown) => testService(str(service, 20) as TestableService, candidate))
}
