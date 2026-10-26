import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launch, realErrors, openCommandBar, KEYS, ROOT, type Launched } from './launch'
import { VALID_KEYS } from '../helpers/fake-apis'

const READY = { ...KEYS, onboardingDone: true, displayName: 'Tester' }
let run: Launched | null = null
test.afterEach(async () => { await run?.close(); run = null })

test('first run: connect the catalog, then add a set from search', async () => {
  run = await launch()
  const { page } = run
  await expect(page.getByRole('heading', { name: /Every brick you own/ })).toBeVisible()
  await page.getByLabel(/What should we call you/).fill('Robin')
  await page.getByRole('button', { name: 'Set up BrickForge' }).click()

  await page.getByPlaceholder('Paste your key').fill(VALID_KEYS.rebrickable)
  await page.getByRole('button', { name: 'Test and save' }).click()
  await expect(page.getByText('Rebrickable accepted the key.')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your vault is ready, Robin.' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Set up BrickForge' }).getByRole('button', { name: /Add a set/ }).click()

  const dialog = page.getByRole('dialog', { name: 'Add to your collection' })
  await dialog.getByPlaceholder(/Set name or number/).fill('galaxy')
  await expect(dialog.getByText('Galaxy Explorer')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add', exact: true }).first().click()
  await expect(page.getByText('Added Galaxy Explorer')).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(page.getByRole('heading', { name: /, Robin$/ })).toBeVisible() // Home greets by name
  await page.getByRole('link', { name: 'Collection' }).click()
  await expect(page.getByRole('article', { name: /Galaxy Explorer/ })).toBeVisible()
  expect(realErrors(run.errors)).toEqual([])
})

test('collection: add by number, edit, add a copy, remove and undo', async () => {
  run = await launch({ settings: READY })
  const { page } = run
  await openCommandBar(page)
  await page.keyboard.type('10497')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Added Galaxy Explorer')).toBeVisible()

  await page.getByRole('link', { name: 'Collection' }).click()
  await page.getByRole('article', { name: /Galaxy Explorer/ }).click()
  const notes = page.getByPlaceholder(/Where you bought it/)
  await notes.fill('From the launch day')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  // Closing straight after an edit, inside the save delay, still keeps it
  await notes.fill('From the 2022 launch day')
  await page.keyboard.press('Escape')

  // Adding it again is a second copy — and the notes survive
  await openCommandBar(page)
  await page.keyboard.type('10497')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Added another copy of Galaxy Explorer')).toBeVisible()
  await page.getByRole('article', { name: /Galaxy Explorer/ }).click()
  await expect(page.getByPlaceholder(/Where you bought it/)).toHaveValue('From the 2022 launch day')
  await expect(page.getByLabel('Quantity')).toHaveValue('2')

  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('article', { name: /Galaxy Explorer/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('article', { name: /Galaxy Explorer/ })).toBeVisible()
  expect(realErrors(run.errors)).toEqual([])
})

test('scan: a minifigure photo becomes a match you can add', async () => {
  run = await launch({ settings: READY })
  const { page } = run
  await page.getByRole('link', { name: 'Scan' }).click()
  await page.locator('input[type=file]').first().setInputFiles(path.join(ROOT, 'resources/icon-256.png'))
  await expect(page.getByRole('heading', { name: /Probably one of these|Found it/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Add', exact: true }).first().click()
  await expect(page.getByText(/^Added /).first()).toBeVisible()
  await page.getByRole('link', { name: 'Collection' }).click()
  await page.getByRole('tab', { name: /Minifigures/ }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  expect(realErrors(run.errors)).toEqual([])
})

test('value: prices update from BrickLink and the vault shows its worth', async () => {
  run = await launch({ settings: READY })
  const { page } = run
  await openCommandBar(page)
  await page.keyboard.type('75192')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Added Millennium Falcon')).toBeVisible()
  await page.getByRole('link', { name: 'Value' }).click()
  await page.getByRole('button', { name: 'Update prices now' }).first().click()
  await expect(page.getByText(/Everything you own/i)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/\$[\d,]+\.\d\d/).first()).toBeVisible()
  expect(realErrors(run.errors)).toEqual([])
})

test('sell: writes a sanitized listing with a title eBay accepts', async () => {
  run = await launch({ settings: READY })
  const { page } = run
  await page.getByRole('link', { name: 'Sell' }).click()
  await page.getByRole('tab', { name: 'By number' }).click()
  await page.getByPlaceholder(/Set number/).fill('75192')
  await page.getByRole('button', { name: 'Use this set' }).click()
  await expect(page.getByRole('heading', { name: 'Millennium Falcon' })).toBeVisible()
  await page.getByRole('button', { name: 'Write the listing' }).click()
  const title = page.locator('p.selectable').first()
  await expect(title).toBeVisible({ timeout: 30_000 })
  const text = (await title.textContent()) ?? ''
  expect(text.length).toBeLessThanOrEqual(80)
  expect(text).not.toMatch(/(w\/|\||&)\s*$/)
  const srcdoc = await page.locator('iframe[title="Listing preview"]').getAttribute('srcdoc')
  expect(srcdoc).not.toMatch(/<script|onerror|onclick/i)
  expect(await page.locator('iframe[title="Listing preview"]').getAttribute('sandbox')).toBe('')
  expect(realErrors(run.errors)).toEqual([])
})

test('settings: theme and brick color apply at once and persist', async () => {
  run = await launch({ settings: READY })
  const { page } = run
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: /Light/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Red' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'red')
  await page.reload()
  await page.waitForSelector('nav[aria-label="Main"]')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'red')
  const saved = JSON.parse(fs.readFileSync(path.join(run.dir, 'settings.json'), 'utf8'))
  expect(saved.rebrickableApiKey).toMatch(/^enc:/) // keys are encrypted on first launch
  expect(realErrors(run.errors)).toEqual([])
})

test('import: a Brickset CSV is reviewed, then imported', async () => {
  run = await launch({ settings: READY })
  const { page, app, dir } = run
  const csv = path.join(dir, 'brickset.csv')
  fs.writeFileSync(csv, 'SetNumber,Name,QtyOwned,Wanted\n10497-1,Galaxy Explorer,1,0\n21330-1,Home Alone,2,0\n75192-1,Millennium Falcon,1,1\n')
  // Stand in for the native file dialog, which tests can't click
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog }, csv)
  await page.getByRole('link', { name: 'Collection' }).click()
  await page.getByRole('button', { name: 'Import / export' }).click()
  await page.getByRole('menuitem', { name: /Import a file/ }).click()
  await page.getByRole('button', { name: /A collection file/ }).click()
  await expect(page.getByText(/brickset\.csv · Brickset CSV/)).toBeVisible()
  await page.getByRole('button', { name: 'Import 3 items' }).click()
  await expect(page.getByText('3 added, 0 updated')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('article', { name: /Home Alone/ })).toBeVisible()
  await page.getByRole('tab', { name: /Wishlist/ }).click()
  await expect(page.getByRole('article', { name: /Millennium Falcon/ })).toBeVisible()
  expect(realErrors(run.errors)).toEqual([])
})

test('demo: every screen renders without errors', async () => {
  run = await launch({ demo: true })
  const { page } = run
  await expect(page.getByText('Demo', { exact: true })).toBeVisible()
  for (const name of ['Collection', 'Catalog', 'Scan', 'Value', 'Sell', 'Settings', 'Home']) {
    await page.getByRole('link', { name }).click()
    await expect(page.locator('h1').first()).toBeVisible()
  }
  await page.getByRole('link', { name: 'Collection' }).click()
  await page.getByRole('article').first().click()
  await expect(page.getByText('Market value')).toBeVisible()
  expect(realErrors(run.errors)).toEqual([])
})
