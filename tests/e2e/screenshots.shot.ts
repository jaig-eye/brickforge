/**
 * Regenerates the README screenshots (npm run screenshots → docs/screenshots).
 * Runs the demo collection against the fake APIs so every screen is full,
 * with motion reduced so nothing is caught mid-animation. Product images load
 * from the Rebrickable CDN, so this needs an internet connection.
 */
import { test, type Page } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { launch, KEYS, ROOT } from './launch'

const OUT = path.join(ROOT, 'docs', 'screenshots')
const SIZE: [number, number] = [1440, 900]

/** Wait for every image on screen to finish loading (off-screen lazy ones never start). */
async function settle(page: Page, ms = 700): Promise<void> {
  await page.waitForFunction(() => [...document.images].every((i) => {
    const r = i.getBoundingClientRect()
    const onScreen = r.bottom > 0 && r.top < innerHeight && r.width > 0
    return !onScreen || (i.complete && i.naturalWidth > 0)
  }), undefined, { timeout: 30_000 }).catch(() => undefined)
  await page.waitForTimeout(ms)
}

async function shot(page: Page, name: string): Promise<void> {
  await settle(page)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}

async function download(url: string, file: string): Promise<string> {
  const res = await fetch(url)
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}

const LISTING_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;background:#111;border-radius:10px;overflow:hidden;border:1px solid #2a2a2a;">
<div style="background:#1a1a1a;border-left:4px solid #FFC929;padding:20px 24px;"><div style="color:#fff;font-size:22px;font-weight:bold;">Galaxy Explorer</div><div style="color:#888;font-size:13px;margin-top:4px;">#10497 · 2022</div></div>
<div style="padding:20px 24px;"><div style="text-transform:uppercase;letter-spacing:2px;font-size:11px;color:#FFC929;margin-bottom:10px;">About this set</div>
<p style="color:#ccc;font-size:14px;line-height:1.6;margin:0;">A loving tribute to LEGO Space's 1979 classic, rebuilt at a bigger scale with a working landing gear, a rear cargo bay, and a detachable rover. The blue and grey hull, trans-yellow canopy, and four classic astronauts make it a centerpiece for any space fan, whether you grew up with the original or are discovering it for the first time.</p></div>
<div style="background:#161616;padding:20px 24px;"><div style="text-transform:uppercase;letter-spacing:2px;font-size:11px;color:#FFC929;margin-bottom:10px;">Set details</div>
<table style="width:100%;border-collapse:collapse;font-size:13px;">
<tr style="background:#1a1a1a;"><td style="color:#777;padding:10px 0 10px 10px;width:40%;">Set number</td><td style="color:#eee;font-weight:bold;">10497</td></tr>
<tr><td style="color:#777;padding:10px 0 10px 10px;">Theme</td><td style="color:#eee;font-weight:bold;">Icons</td></tr>
<tr style="background:#1a1a1a;"><td style="color:#777;padding:10px 0 10px 10px;">Minifigures</td><td style="color:#eee;font-weight:bold;">4 included</td></tr>
<tr><td style="color:#777;padding:10px 0 10px 10px;">Condition</td><td style="color:#eee;font-weight:bold;">Complete</td></tr></table></div>
<div style="padding:20px 24px;"><div style="text-transform:uppercase;letter-spacing:2px;font-size:11px;color:#FFC929;margin-bottom:10px;">What's included</div>
<div style="color:#ccc;font-size:13px;padding:8px 0;border-bottom:1px solid #1e1e1e;"><span style="color:#3dd68c;">&#10003;</span>&nbsp; LEGO Icons Galaxy Explorer 10497</div>
<div style="color:#ccc;font-size:13px;padding:8px 0;border-bottom:1px solid #1e1e1e;"><span style="color:#3dd68c;">&#10003;</span>&nbsp; Original instruction manual</div>
<div style="color:#ccc;font-size:13px;padding:8px 0;"><span style="color:#3dd68c;">&#10003;</span>&nbsp; All 4 minifigures</div></div>
<div style="background:#0d0d0d;padding:14px 24px;text-align:center;color:#555;font-size:11px;">Authentic LEGO® product · Personally inspected</div></div>`

test('README screenshots', async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-shots-'))

  // ── First run (empty profile) ──
  {
    const run = await launch({ size: SIZE, settings: { reduceMotion: 'on', displayName: '' } })
    await shot(run.page, 'onboarding')
    await run.close()
  }

  // ── The demo collection ──
  const run = await launch({ demo: true, size: SIZE, settings: { ...KEYS, reduceMotion: 'on' } })
  const { page, apis } = run
  try {
    await shot(page, 'home')

    await page.getByRole('link', { name: 'Collection' }).click()
    await shot(page, 'collection')
    await page.getByRole('article', { name: /Millennium Falcon/ }).click()
    await page.getByText('Market value').waitFor()
    await shot(page, 'item')
    await page.keyboard.press('Escape')

    await page.getByRole('link', { name: 'Catalog' }).click()
    await page.getByRole('article').first().waitFor()
    await shot(page, 'catalog')

    // Two real photos through the scan queue
    const sets = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/rebrickable/sets.json'), 'utf8'))
    const figs = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/rebrickable/minifigs.json'), 'utf8'))
    const setPhoto = await download(sets['10497-1'].set_img_url, path.join(tmp, 'set.jpg'))
    const figPhoto = await download(figs['fig-002544'].set_img_url, path.join(tmp, 'fig.jpg'))
    await page.getByRole('link', { name: 'Scan' }).click()
    await page.getByRole('tab', { name: 'Sets' }).click()
    await page.locator('input[type=file]').first().setInputFiles(setPhoto)
    await page.getByRole('tab', { name: 'Minifigures' }).click()
    await page.locator('input[type=file]').first().setInputFiles(figPhoto)
    await page.getByRole('heading', { name: /Found it|Probably one of these|Best guess/ }).nth(1).waitFor({ timeout: 60_000 })
    await page.waitForTimeout(3800) // let the "added to the queue" toasts go
    await page.evaluate(() => {
      const root = document.querySelector('[data-scroll-root]')
      const first = document.querySelector('main li.panel')
      if (root && first) root.scrollTop += first.getBoundingClientRect().top - 150
    })
    await shot(page, 'scan')

    await page.getByRole('link', { name: 'Value' }).click()
    await page.getByText('Everything you own').waitFor()
    await shot(page, 'value')

    // A listing written by the (fake) AI with a realistic description
    apis.override((req) => (req.service === 'anthropic' && req.path === '/v1/messages' && req.body.toString().includes('eBay listing')
      ? {
          json: {
            id: 'msg_shot', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null, stop_details: null,
            usage: { input_tokens: 900, output_tokens: 700 },
            content: [{ type: 'text', text: JSON.stringify({ title: 'LEGO Icons Galaxy Explorer 10497 | Complete w/ Manual & 4 Minifigs', description: LISTING_HTML }) }],
          },
        }
      : undefined))
    await page.getByRole('link', { name: 'Sell' }).click()
    await page.getByRole('button', { name: /Galaxy Explorer/ }).click()
    await page.getByRole('heading', { name: 'Galaxy Explorer' }).waitFor()
    await page.getByRole('button', { name: 'Write the listing' }).click()
    await page.locator('iframe[title="Listing preview"]').waitFor()
    await page.waitForTimeout(800)
    await shot(page, 'sell')

    await page.getByRole('link', { name: 'Settings' }).click()
    await shot(page, 'settings')

    await page.getByRole('tab', { name: /Light/ }).click()
    await page.getByRole('link', { name: 'Home' }).click()
    await shot(page, 'home-light')
    await page.getByRole('link', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: /Dark/ }).click()
  } finally {
    await run.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
