/**
 * A fresh, isolated BrickForge for one test file: its own userData folder,
 * a migrated database, all IPC handlers registered, and every external API
 * pointed at the local fake server.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { handlers, sent } from '../stubs/electron'
import type { IpcResult } from '../../src/lib/errors'
import { startFakeApis, type FakeApis } from './fake-apis'
import { blockedRequests } from './offline'

export interface TestEnv {
  dir: string
  apis: FakeApis
  /** Call an IPC channel exactly like the renderer does. */
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<IpcResult<T>>
  /** Same, but unwraps the result and throws on { ok: false }. */
  call<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
  pushes(channel: string): unknown[]
  close(): Promise<void>
}

export async function createTestEnv(opts: { seedDb?: string } = {}): Promise<TestEnv> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-test-'))
  process.env.BRICKFORGE_USER_DATA = dir
  if (opts.seedDb) fs.copyFileSync(opts.seedDb, path.join(dir, 'brickforge.db'))

  const apis = await startFakeApis()
  for (const [service, url] of Object.entries(apis.urls)) {
    process.env[`BRICKFORGE_${service.toUpperCase().replace(/-/g, '_')}_URL`] = url
  }

  const { runMigrations } = await import('../../electron/db/migrate')
  await runMigrations(path.resolve(__dirname, '../../electron/db/migrations'))
  const { registerAllHandlers } = await import('../../electron/ipc/index')
  registerAllHandlers()

  const invoke = async <T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> => {
    const fn = handlers.get(channel)
    if (!fn) throw new Error(`No handler registered for ${channel}`)
    return (await fn({}, ...args)) as IpcResult<T>
  }
  return {
    dir,
    apis,
    invoke,
    async call<T>(channel: string, ...args: unknown[]): Promise<T> {
      const res = await invoke<T>(channel, ...args)
      if (!res.ok) throw Object.assign(new Error(res.error.message), res.error)
      return res.data
    },
    pushes: (channel) => sent.filter((s) => s.channel === channel).map((s) => s.payload),
    async close() {
      const { closeDb } = await import('../../electron/db/index')
      closeDb()
      await apis.close()
      fs.rmSync(dir, { recursive: true, force: true })
      // Catalog images live on CDNs the fake server doesn't mirror (they fail
      // like an offline machine); any other blocked request is an API call
      // that bypassed serviceUrl and would hit the real service
      const stray = blockedRequests.filter((u) => !/\.(jpe?g|png|webp|gif)$/i.test(new URL(u).pathname))
      if (stray.length) throw new Error(`Requests escaped the fake APIs: ${stray.join(', ')}`)
    },
  }
}
