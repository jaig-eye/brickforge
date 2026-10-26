/**
 * The persistent scan queue end to end: photos are saved, the background
 * worker identifies them (Brickognize first, an AI judge when unsure), and
 * the results, accuracy samples, and image files are managed through IPC.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { createTestEnv, type TestEnv } from '../helpers/env'
import { VALID_KEYS, type Override } from '../helpers/fake-apis'
import { makePng } from '../helpers/images'
import { answerWhen, imagesOf, isAnthropicCall, promptOf } from '../helpers/ai'
import { IPC } from '../../src/lib/ipc-types'
import type { FigIdentifyResult, PieceIdentifyResult, ScanEvalStats, ScanJob, SetIdentifyResult } from '../../src/lib/types'

let env: TestEnv
let seed = 0
const scansDir = () => path.join(env.dir, 'scans')
const fileFor = (png: Buffer) => path.join(scansDir(), `${crypto.createHash('sha1').update(png).digest('hex')}.jpg`)
const jobs = () => env.call<ScanJob[]>(IPC.SCAN_LIST)
const anthropicCalls = () => env.apis.requests.filter(isAnthropicCall)

const BB8 = { id: 'sw1034', name: 'BB-8 (Large Photoreceptor and Large Black Circle)', img_url: null, external_sites: [], category: 'Star Wars', type: 'fig' }

function brickognize(kind: 'figs' | 'sets' | 'parts', reply: { status?: number; json?: unknown; text?: string }): () => void {
  return env.apis.override((req) => (req.service === 'brickognize' && req.path === `/predict/${kind}/` ? reply : undefined))
}

async function withOverrides<T>(overrides: Override[], fn: () => Promise<T>): Promise<T> {
  const undo = overrides.map((o) => env.apis.override(o))
  try { return await fn() } finally { undo.forEach((u) => u()) }
}

/** Queue one photo and wait for the worker to finish it. */
async function scan(scanType: 'minifig' | 'set', png = makePng(++seed)): Promise<ScanJob & { png: Buffer }> {
  const before = Math.max(0, ...(await jobs()).map((j) => j.id))
  const res = await env.call<{ enqueued: number }>(IPC.SCAN_ENQUEUE, [png.toString('base64')], { scanType })
  expect(res.enqueued).toBe(1)
  return { ...(await waitForJob((j) => j.id > before)), png }
}

async function waitForJob(pick: (j: ScanJob) => boolean): Promise<ScanJob> {
  const deadline = Date.now() + 20_000
  for (;;) {
    const job = (await jobs()).find(pick)
    if (job && job.status !== 'queued' && job.status !== 'running') return job
    if (Date.now() > deadline) throw new Error(`scan job did not finish: ${JSON.stringify(job)}`)
    await new Promise((r) => setTimeout(r, 25))
  }
}

beforeAll(async () => { env = await createTestEnv() })
afterAll(() => env?.close())

describe('minifig scans', () => {
  it('a confident Brickognize match is the answer, no AI needed', async () => {
    const job = await scan('minifig')
    expect(job).toMatchObject({ scan_type: 'minifig', status: 'done', error: null })
    const result = job.result as FigIdentifyResult
    expect(result.model_used).toBe('brickognize')
    expect(result.matches[0]).toMatchObject({ fig_number: 'sw1034', bricklink_id: 'sw1034', name: 'BB-8 (Large Photoreceptor and Large Black Circle)' })
    expect(result.matches[0].confidence).toBeCloseTo(0.729, 3)
    expect(job.confidence).toBeCloseTo(0.729, 3)
    expect(anthropicCalls()).toHaveLength(0)
    // The photo is kept in userData/scans, and its thumbnail is served from there
    expect(fs.existsSync(fileFor(job.png))).toBe(true)
    expect(await env.call<string>(IPC.SCAN_IMAGE, job.id)).toBe(`data:image/png;base64,${job.png.toString('base64')}`)
  })

  it('without an AI, an uncertain match is offered as a capped suggestion and says why', async () => {
    const undo = brickognize('figs', { json: { listing_id: 'x', items: [{ ...BB8, score: 0.49 }] } })
    try {
      const job = await scan('minifig')
      const result = job.result as FigIdentifyResult
      expect(job.status).toBe('done')
      expect(result.model_used).toBe('brickognize')
      expect(result.matches).toEqual([expect.objectContaining({ fig_number: 'sw1034', confidence: 0.45, reason: 'Uncertain visual match' })])
      expect(result.error).toMatch(/uncertain.*add an AI provider in Settings/i)
      expect(job.confidence).toBe(0.45)
    } finally {
      undo()
    }
  })

  it('without an AI or any match, the job finishes with an explanation instead of a guess', async () => {
    const undo = brickognize('figs', { json: { listing_id: 'x', items: [] } })
    try {
      const job = await scan('minifig')
      expect(job.status).toBe('error')
      expect(job.error).toMatch(/No visual match found/)
    } finally {
      undo()
    }
  })

  it('with Anthropic set up, an unsure photo is described, searched on Rebrickable, and judged against real candidates', async () => {
    await env.call(IPC.SETTINGS_SET_SECRET, 'rebrickable', VALID_KEYS.rebrickable)
    await env.call(IPC.SETTINGS_SET_SECRET, 'anthropic', VALID_KEYS.anthropic)
    await env.call(IPC.SETTINGS_SET_AI, 'anthropic', 'claude-opus-5-5')
    const describe = answerWhen((p) => p.includes('MAIN SUBJECT'), JSON.stringify({
      subject: 'minifig', character: 'Kuiil', franchise: 'Star Wars', features: ['brick-built backpack'], search_terms: ['Kuill'],
    }))
    const callsBefore = anthropicCalls().length
    const job = await withOverrides([describe], async () => {
      const undo = brickognize('figs', { json: { listing_id: 'x', items: [] } })
      try { return await scan('minifig') } finally { undo() }
    })
    const result = job.result as FigIdentifyResult
    expect(job.status).toBe('done')
    expect(result.model_used).toBe('claude-opus-5-5')
    expect(result.matches).toEqual([expect.objectContaining({ fig_number: 'fig-013153', name: 'Kuill', confidence: 0.9 })])
    expect(result.description).toBe('Kuiil — Star Wars')

    const [describeCall, judgeCall] = anthropicCalls().slice(callsBefore)
    expect(promptOf(describeCall)).toContain('MAIN SUBJECT')
    expect(promptOf(judgeCall)).toContain('CANDIDATE 1: fig-013153 — Kuill')
    // Both calls see the user's photo
    expect(imagesOf(describeCall)[0]).toBe(job.png.toString('base64'))
    expect(imagesOf(judgeCall)[0]).toBe(job.png.toString('base64'))
    const searches = env.apis.requests.filter((r) => r.service === 'rebrickable' && r.path === '/minifigs/')
    expect(searches.map((r) => r.query.get('search'))).toContain('Kuill')
  })

  it('drops a judge pick that is not one of the candidates', async () => {
    const describe = answerWhen((p) => p.includes('MAIN SUBJECT'), JSON.stringify({ subject: 'minifig', character: 'Kuiil', search_terms: ['Kuill'] }))
    const judge = answerWhen((p) => p.includes('CANDIDATE 1:'), JSON.stringify({ picks: [{ fig_number: 'fig-999999', confidence: 0.99 }, { fig_number: 'fig-013153', confidence: 0.7 }] }))
    const job = await withOverrides([describe, judge], async () => {
      const undo = brickognize('figs', { json: { listing_id: 'x', items: [] } })
      try { return await scan('minifig') } finally { undo() }
    })
    expect((job.result as FigIdentifyResult).matches.map((m) => [m.fig_number, m.confidence])).toEqual([['fig-013153', 0.7]])
  })

  it('a built set scanned in minifig mode is rerouted to set identification in one write', async () => {
    const describe = answerWhen((p) => p.includes('MAIN SUBJECT'), JSON.stringify({ subject: 'set', franchise: 'Classic Space' }))
    const job = await withOverrides([describe], async () => {
      const undo = brickognize('figs', { json: { listing_id: 'x', items: [{ ...BB8, score: 0.2 }] } })
      try { return await scan('minifig') } finally { undo() }
    })
    expect(job).toMatchObject({ scan_type: 'set', status: 'done' })
    expect((job.result as SetIdentifyResult)).toMatchObject({ set_number: '10497', verified: true })
  })
})

describe('set scans', () => {
  it('judges the photo against visual and name-search candidates and verifies the answer', async () => {
    const job = await scan('set')
    const result = job.result as SetIdentifyResult
    expect(job.status).toBe('done')
    expect(result).toMatchObject({
      set_number: '10497', set_name: 'Galaxy Explorer', verified: true, confidence: 0.88, model_used: 'claude-opus-5-5',
      rb: { set_num: '10497-1', name: 'Galaxy Explorer', year: 2022, num_parts: 1254, theme: 'Icons' },
    })
    // Brickognize's lookalike plus what the scout found by name
    expect(result.candidates[0]).toMatchObject({ set_num: '10497-1', source: 'visual' })
    expect(result.candidates.filter((c) => c.source === 'search').map((c) => c.set_num)).toContain('75192-1')
    const catalog = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/rebrickable/sets.json'), 'utf8')) as Record<string, unknown>
    expect(catalog).toHaveProperty(`${result.set_number}-1`)
  })

  it('caps confidence at 0.6 when there was only one candidate to choose from', async () => {
    const scout = answerWhen((p) => p.includes('FOUND BY NAME'), JSON.stringify({ queries: ['Zzyzx Qwerty'] }))
    const job = await withOverrides([scout], () => scan('set'))
    const result = job.result as SetIdentifyResult
    expect(result.candidates).toHaveLength(1)
    expect(result).toMatchObject({ set_number: '10497', verified: true, confidence: 0.6 })
  })

  it('lifts the cap only when the judge transcribed the printed set number', async () => {
    const scout = answerWhen((p) => p.includes('FOUND BY NAME'), JSON.stringify({ queries: [] }))
    const judge = answerWhen((p) => p.includes('set identifier'), JSON.stringify({
      set_number: '10497', set_name: 'Galaxy Explorer', confidence: 0.95, set_number_visible: true, visible_number: '10497', notes: 'Box front',
    }))
    const job = await withOverrides([scout, judge], () => scan('set'))
    expect(job.result).toMatchObject({ set_number: '10497', confidence: 0.95, set_number_visible: true })
  })

  it('never verifies an answer that is not a real catalog set', async () => {
    const judge = answerWhen((p) => p.includes('set identifier'), JSON.stringify({ set_number: '99999', set_name: 'Made Up', confidence: 0.97 }))
    const job = await withOverrides([judge], () => scan('set'))
    expect(job.result).toMatchObject({ set_number: '99999', verified: false, rb: null, confidence: 0.4 })
  })

  it('a failed judge with nothing to show is an error that can be retried', async () => {
    const garbled = answerWhen((p) => p.includes('set identifier'), 'I think it is a spaceship!')
    const scout = answerWhen((p) => p.includes('FOUND BY NAME'), JSON.stringify({ queries: [] }))
    const failed = await withOverrides([garbled, scout], async () => {
      const undo = brickognize('sets', { json: { listing_id: 'x', items: [] } })
      try { return await scan('set') } finally { undo() }
    })
    expect(failed.status).toBe('error')
    expect(failed.error).toMatch(/expected format/)

    await env.call(IPC.SCAN_RETRY, failed.id)
    const retried = await waitForJob((j) => j.id === failed.id)
    expect(retried).toMatchObject({ status: 'done', error: null })
  })
})

describe('accepting results', () => {
  it('records your pick as an accuracy sample: confirmed when it matches, corrected when not', async () => {
    const all = await jobs()
    const brickognizeJob = all.find((j) => j.status === 'done' && (j.result as FigIdentifyResult | null)?.model_used === 'brickognize' && (j.result as FigIdentifyResult).matches[0]?.confidence > 0.7)!
    const aiFigJob = all.find((j) => (j.result as FigIdentifyResult | null)?.matches?.[0]?.fig_number === 'fig-013153')!
    const setJob = all.find((j) => j.scan_type === 'set' && (j.result as SetIdentifyResult | null)?.confidence === 0.88)!

    await env.call(IPC.SCAN_ACCEPT, brickognizeJob.id, 'sw1034')
    await env.call(IPC.SCAN_ACCEPT, aiFigJob.id, 'fig-002544') // you knew better
    await env.call(IPC.SCAN_ACCEPT, setJob.id, '10497-1') // "-1" or not, same set

    const stats = await env.call<ScanEvalStats>(IPC.SCAN_STATS)
    expect(stats).toMatchObject({ total: 3, confirmed: 2 })
    expect(stats.accuracy).toBeCloseTo(2 / 3)
    expect(stats.bySource).toEqual(expect.arrayContaining([
      { source: 'brickognize', total: 1, confirmed: 1 },
      { source: 'claude-opus-5-5', total: 2, confirmed: 1 },
    ]))
    expect((await jobs()).find((j) => j.id === setJob.id)?.status).toBe('added')
  })

  it('a second pick on the same job replaces the first', async () => {
    const job = (await jobs()).find((j) => j.status === 'added' && j.scan_type === 'minifig' && (j.result as FigIdentifyResult).model_used === 'brickognize')!
    await env.call(IPC.SCAN_ACCEPT, job.id, 'sw0700')
    expect(await env.call<ScanEvalStats>(IPC.SCAN_STATS)).toMatchObject({ total: 3, confirmed: 1 })
  })

  it('auto-adds are not accuracy samples', async () => {
    const job = (await jobs()).find((j) => j.status === 'done')!
    await env.call(IPC.SCAN_ACCEPT, job.id, 'sw1034', true)
    expect((await jobs()).find((j) => j.id === job.id)?.status).toBe('added')
    expect((await env.call<ScanEvalStats>(IPC.SCAN_STATS)).total).toBe(3)
  })
})

describe('cleaning up', () => {
  it('dismissing a job deletes its row and its photo', async () => {
    const job = await scan('minifig')
    expect(fs.existsSync(fileFor(job.png))).toBe(true)
    await env.call(IPC.SCAN_DISMISS, [job.id])
    expect((await jobs()).map((j) => j.id)).not.toContain(job.id)
    expect(fs.existsSync(fileFor(job.png))).toBe(false)
  })

  it('a photo two jobs share is kept until the last job using it is gone', async () => {
    const png = makePng(++seed)
    const a = await scan('minifig', png)
    const b = await scan('minifig', png)
    await env.call(IPC.SCAN_DISMISS, [a.id])
    expect(fs.existsSync(fileFor(png))).toBe(true)
    await env.call(IPC.SCAN_DISMISS, [b.id])
    expect(fs.existsSync(fileFor(png))).toBe(false)
  })

  it('clearing finished jobs deletes their rows and every photo in userData/scans', async () => {
    expect((await jobs()).length).toBeGreaterThan(0)
    expect(fs.readdirSync(scansDir()).length).toBeGreaterThan(0)
    const cleared = await env.call<number>(IPC.SCAN_CLEAR)
    expect(cleared).toBeGreaterThan(0)
    expect(await jobs()).toEqual([])
    expect(fs.readdirSync(scansDir())).toEqual([])
  })
})

describe('pieces', () => {
  it('identifies a single piece with Brickognize', async () => {
    const res = await env.call<PieceIdentifyResult>(IPC.SCAN_PIECE, makePng(++seed).toString('base64'))
    expect(res.model_used).toBe('brickognize')
    expect(res.pieces[0]).toMatchObject({ part_number: '3001', name: 'Brick 2 x 4', bricklink_url: 'https://www.bricklink.com/v2/catalog/catalogitem.page?P=3001' })
    expect(res.pieces).toHaveLength(2)
  })

  it('refuses something that is not an image', async () => {
    expect(await env.invoke(IPC.SCAN_PIECE, 'abc')).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
  })
})
