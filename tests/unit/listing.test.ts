import { describe, it, expect } from 'vitest'
import { fitTitle, buildListingPrompt } from '../../electron/services/listing'
import type { ListingInput, ListingPrefs } from '../../src/lib/types'

describe('fitTitle', () => {
  it('leaves a title that already fits alone, apart from collapsing whitespace', () => {
    expect(fitTitle('  LEGO Star Wars  Millennium Falcon 75192 |\tComplete w/ Manual ')).toBe('LEGO Star Wars Millennium Falcon 75192 | Complete w/ Manual')
  })

  it('caps long titles at 80 characters on a word boundary', () => {
    const t = fitTitle('LEGO Harry Potter Hogwarts Castle and Grounds 76419 | 99% Complete w/ Manual & Box')
    expect(t.length).toBeLessThanOrEqual(80)
    expect(t).toBe('LEGO Harry Potter Hogwarts Castle and Grounds 76419 | 99% Complete w/ Manual')
  })

  it('never ends on a dangling "w/" (the real "… | 99% Complete w/" bug)', () => {
    expect(fitTitle('LEGO Star Wars Ultimate Collector Series Razor Crest 75331 | 99% Complete w/ Manual'))
      .toBe('LEGO Star Wars Ultimate Collector Series Razor Crest 75331 | 99% Complete')
  })

  it('strips dangling separators: |, &, w/, with, and, -, ·', () => {
    expect(fitTitle('LEGO Icons Titanic 10294 |')).toBe('LEGO Icons Titanic 10294')
    expect(fitTitle('LEGO Icons Titanic 10294 | Complete w/ Manual &')).toBe('LEGO Icons Titanic 10294 | Complete w/ Manual')
    expect(fitTitle('LEGO Icons Titanic 10294 | Complete with')).toBe('LEGO Icons Titanic 10294 | Complete')
    expect(fitTitle('LEGO Icons Titanic 10294 | Manual and')).toBe('LEGO Icons Titanic 10294 | Manual')
    expect(fitTitle('LEGO Icons Titanic 10294 -')).toBe('LEGO Icons Titanic 10294')
    expect(fitTitle('LEGO Icons Titanic 10294 ·')).toBe('LEGO Icons Titanic 10294')
  })

  it('strips a run of separators at once', () => {
    expect(fitTitle('LEGO Icons Titanic 10294 | Complete w/ & |')).toBe('LEGO Icons Titanic 10294 | Complete')
  })

  it('keeps words that merely end like a separator', () => {
    expect(fitTitle('LEGO Creator Expert Grand')).toBe('LEGO Creator Expert Grand')
    expect(fitTitle('LEGO Ideas Lighthouse Highland')).toBe('LEGO Ideas Lighthouse Highland')
  })

  it('drops a trailing comma left by the cut ("… Box, Minifigs,")', () => {
    const t = fitTitle('LEGO Star Wars Millennium Falcon 75192 | Complete w/ Manual, Box, Minifigs, Smoke-Free Home')
    expect(t).toBe('LEGO Star Wars Millennium Falcon 75192 | Complete w/ Manual, Box, Minifigs')
  })

  it('keeps a word that ends exactly at the 80th character', () => {
    const t = fitTitle('LEGO Star Wars Millennium Falcon 75192 | Complete w/ Manual & Box & Minifigs UCS Clean Smoke-Free')
    expect(t).toBe('LEGO Star Wars Millennium Falcon 75192 | Complete w/ Manual & Box & Minifigs UCS')
    expect(t.length).toBe(80)
  })

  it('hard-cuts a title with no usable word boundary', () => {
    const t = fitTitle(`LEGO ${'X'.repeat(100)}`)
    expect(t.length).toBe(80)
  })
})

describe('buildListingPrompt', () => {
  const set: ListingInput = { set_number: '75192-1', name: 'Millennium Falcon', year: 2017, theme: 'Star Wars', piece_count: 7541, minifig_count: 0 }
  const prefs: ListingPrefs = {
    completeness: 'complete', includes_instructions: true, includes_figures: true, includes_box: false,
    smoke_free_home: false, clean_set: false, seller_notes: null,
  }

  it('shows the set number without its -1 suffix', () => {
    const p = buildListingPrompt(set, prefs)
    expect(p).toContain('Set Number : 75192\n')
    expect(p).toContain('#75192 · 2017')
    expect(p).not.toContain('75192-1')
  })

  it('omits the minifigure row when the set has none', () => {
    const p = buildListingPrompt(set, prefs)
    expect(p).toContain('Minifigures: OMIT THIS ROW — this set has no minifigures')
    expect(p).toContain('Minifigs   : None — this set has no minifigures')
    expect(p).not.toMatch(/w\/ \d+ Minifig/)
    expect(p).not.toMatch(/minifigures? included/)
  })

  it('omits the minifigure row when the seller is not including them', () => {
    const p = buildListingPrompt({ ...set, minifig_count: 9 }, { ...prefs, includes_figures: false })
    expect(p).toContain('Minifigures: OMIT THIS ROW — the seller is not including minifigures')
    expect(p).not.toContain('w/ 9 Minifigs')
    expect(p).not.toContain('All 9 minifigures included')
  })

  it('lists included minifigures, with singular wording for one', () => {
    const nine = buildListingPrompt({ ...set, minifig_count: 9 }, prefs)
    expect(nine).toContain('Minifigures: "9 included"')
    expect(nine).toContain('w/ 9 Minifigs')
    expect(nine).toContain('• All 9 minifigures included')
    const one = buildListingPrompt({ ...set, minifig_count: 1 }, prefs)
    expect(one).toMatch(/w\/ 1 Minifig$/m)
    expect(one).toContain('• All 1 minifigure included')
  })

  it('strips angle brackets from seller notes so they cannot smuggle markup in', () => {
    const p = buildListingPrompt(set, { ...prefs, seller_notes: 'Box has <b>dents</b><script>alert(1)</script>' })
    expect(p).toContain('Seller Notes ("Box has bdents/bscriptalert(1)/script")')
  })

  it('caps seller notes at 600 characters and leaves them out when empty', () => {
    const p = buildListingPrompt(set, { ...prefs, seller_notes: 'n'.repeat(900) })
    expect(p).toContain(`Seller Notes ("${'n'.repeat(600)}")`)
    expect(p).not.toContain('n'.repeat(601))
    expect(buildListingPrompt(set, prefs)).not.toContain('Seller Notes')
  })

  it('describes completeness and extras in the title keyword order', () => {
    const p = buildListingPrompt(set, { ...prefs, completeness: 'partial', includes_box: true, smoke_free_home: true, clean_set: true })
    expect(p).toContain('Keyword order: LEGO, Star Wars, Millennium Falcon, 75192, 99% Complete, w/ Manual, w/ Box, Clean, Smoke-Free')
    expect(p).toContain('Condition  : 99% Complete — may be missing a small number of minor pieces')
    expect(buildListingPrompt(set, { ...prefs, completeness: 'incomplete' })).toContain('Condition  : Incomplete — missing pieces, listed as-is')
  })

  it('falls back to "LEGO" when the theme is unknown', () => {
    expect(buildListingPrompt({ ...set, theme: null }, prefs)).toContain('Theme      : LEGO\n')
  })
})
