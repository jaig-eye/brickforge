import { describe, it, expect } from 'vitest'
import {
  normalizeSetCondition, normalizeFigCondition, priceConditionForSet, priceConditionForFig,
  SET_CONDITION_LABEL, FIG_CONDITION_LABEL,
} from '../../src/lib/conditions'
import { isRebrickableFigNumber, looksLikeBricklinkFigId, bricklinkLookupId, bricklinkCatalogUrl } from '../../src/lib/lego-ids'

describe('set conditions', () => {
  it('maps legacy and Brickset vocabulary onto the three-value model', () => {
    expect(normalizeSetCondition('sealed')).toBe('sealed')
    expect(normalizeSetCondition('new')).toBe('sealed')
    expect(normalizeSetCondition(' NEW ')).toBe('sealed')
    expect(normalizeSetCondition('used')).toBe('open_complete')
    expect(normalizeSetCondition('open_complete')).toBe('open_complete')
    expect(normalizeSetCondition('incomplete')).toBe('open_incomplete')
    expect(normalizeSetCondition('Open_Incomplete')).toBe('open_incomplete')
  })

  it('treats unknown or missing values as opened and complete', () => {
    expect(normalizeSetCondition('mint in box?')).toBe('open_complete')
    expect(normalizeSetCondition(null)).toBe('open_complete')
    expect(normalizeSetCondition(undefined)).toBe('open_complete')
  })

  it('prices sealed sets at "new" and every other set at "used"', () => {
    expect(priceConditionForSet('sealed')).toBe('new')
    expect(priceConditionForSet('new')).toBe('new')
    expect(priceConditionForSet('open_complete')).toBe('used')
    expect(priceConditionForSet('open_incomplete')).toBe('used')
    expect(priceConditionForSet(null)).toBe('used')
  })

  it('has a label for every condition', () => {
    expect(Object.keys(SET_CONDITION_LABEL).sort()).toEqual(['open_complete', 'open_incomplete', 'sealed'])
  })
})

describe('minifig conditions', () => {
  it('normalizes case and whitespace, and defaults to used', () => {
    expect(normalizeFigCondition('New')).toBe('new')
    expect(normalizeFigCondition(' cracked ')).toBe('cracked')
    expect(normalizeFigCondition('like new')).toBe('used')
    expect(normalizeFigCondition(null)).toBe('used')
  })

  it('prices damaged figs as used (BrickLink has no "cracked" guide)', () => {
    expect(priceConditionForFig('new')).toBe('new')
    expect(priceConditionForFig('used')).toBe('used')
    expect(priceConditionForFig('cracked')).toBe('used')
    expect(FIG_CONDITION_LABEL.cracked).toBe('Damaged')
  })
})

describe('minifig ids', () => {
  it('recognizes Rebrickable-internal fig numbers', () => {
    expect(isRebrickableFigNumber('fig-002544')).toBe(true)
    expect(isRebrickableFigNumber('sw1034')).toBe(false)
  })

  it('accepts BrickLink-shaped ids and rejects set numbers and Rebrickable numbers', () => {
    for (const id of ['sw0380', 'njo123a', 'col456', 'sh0725', 'idea101', ' sw1034 ']) expect(looksLikeBricklinkFigId(id)).toBe(true)
    for (const id of ['75192', '75192-1', 'fig-002544', 's1', 'abcdefg123', 'sw0380ab', '']) expect(looksLikeBricklinkFigId(id)).toBe(false)
  })

  it('prices a fig by its cached BrickLink id, else its own number unless that is Rebrickable-internal', () => {
    expect(bricklinkLookupId('fig-002544', 'sw1034')).toBe('sw1034')
    expect(bricklinkLookupId('fig-002544', '  sw1034 ')).toBe('sw1034')
    expect(bricklinkLookupId('sw0700', null)).toBe('sw0700')
    expect(bricklinkLookupId('fig-002544', null)).toBeNull()
    expect(bricklinkLookupId('fig-002544', '')).toBeNull()
    // A Rebrickable number cached in the BrickLink column is not a BrickLink id
    expect(bricklinkLookupId('fig-002544', 'fig-002544')).toBeNull()
  })
})

describe('catalog URLs', () => {
  it('builds BrickLink catalog links per item type, encoding the id', () => {
    expect(bricklinkCatalogUrl('S', '75192-1')).toBe('https://www.bricklink.com/v2/catalog/catalogitem.page?S=75192-1')
    expect(bricklinkCatalogUrl('M', 'sw1034')).toBe('https://www.bricklink.com/v2/catalog/catalogitem.page?M=sw1034')
    expect(bricklinkCatalogUrl('P', '3001')).toBe('https://www.bricklink.com/v2/catalog/catalogitem.page?P=3001')
    expect(bricklinkCatalogUrl('M', 'a&b=c')).toBe('https://www.bricklink.com/v2/catalog/catalogitem.page?M=a%26b%3Dc')
  })
})
