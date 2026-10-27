/**
 * Launch the built BrickForge in a throwaway data folder, wired to the local
 * fake APIs. Pre-seeded settings (plain-text keys are encrypted by the app on
 * first launch) let a test skip straight to the screen it cares about.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { startFakeApis, VALID_KEYS, type FakeApis } from '../helpers/fake-apis'

export const ROOT = path.resolve(__dirname, '../..')

export interface Launched {
  app: ElectronApplication
  page: Page
  apis: FakeApis
  dir: string
  errors: string[]
  close(): Promise<void>
}

export const KEYS = {
  rebrickableApiKey: VALID_KEYS.rebrickable,
  bricklinkConsumerKey: VALID_KEYS.bricklinkConsumer,
  bricklinkConsumerSecret: 'test-consumer-secret',
  bricklinkToken: 'test-token',
  bricklinkTokenSecret: 'test-token-secret',
  anthropicApiKey: VALID_KEYS.anthropic,
  aiProvider: 'anthropic',
}

export async function launch(opts: { demo?: boolean; settings?: Record<string, unknown>; size?: [number, number] } = {}): Promise<Launched> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-e2e-'))
  // BRICKFORGE_E2E_REDUCED_MOTION=1 turns the app's animations down, for machines that
  // render slowly (an Intel build under Rosetta emulation on a CI runner)
  const settings = process.env.BRICKFORGE_E2E_REDUCED_MOTION ? { reduceMotion: 'on', ...opts.settings } : opts.settings
  if (settings) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2))
  const apis = await startFakeApis()

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v != null) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE // set by some tools; it would start Electron as plain Node
  delete env.NODE_ENV
  env.BRICKFORGE_USER_DATA = dir
  for (const [service, url] of Object.entries(apis.urls)) env[`BRICKFORGE_${service.toUpperCase()}_URL`] = url

  // BRICKFORGE_E2E_APP points at a packaged build's executable to test what ships
  const packaged = process.env.BRICKFORGE_E2E_APP
  const demo = opts.demo ? ['--demo'] : []
  const app = packaged
    ? await electron.launch({ executablePath: packaged, args: demo, env })
    : await electron.launch({ args: ['.', ...demo], cwd: ROOT, env })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  if (opts.size) {
    await app.evaluate(({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.unmaximize()
      win.setContentSize(w, h)
      win.center()
    }, opts.size)
  }
  await page.waitForSelector('nav[aria-label="Main"]')
  await page.waitForFunction(() => !document.querySelector('[data-splash]'), undefined, { timeout: 15_000 })

  return {
    app, page, apis, dir, errors,
    async close() {
      await app.close().catch(() => undefined)
      await apis.close()
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    },
  }
}

/** Errors worth failing a test over (image loads from the CDN can fail offline). */
export function realErrors(errors: string[]): string[] {
  return errors.filter((e) => !/Failed to load resource|net::ERR_|cdn\.rebrickable\.com|img\.bricklink\.com|Reduced Motion/i.test(e))
}

export async function openCommandBar(page: Page): Promise<void> {
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Type a set number, a name, or an action').waitFor()
}
