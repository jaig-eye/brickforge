/**
 * namesAgree decides whether the Rebrickable ↔ BrickLink minifig id bridge
 * accepts a Brickognize match. The table is real: Rebrickable names from
 * tests/fixtures/rebrickable/minifigs.json against the BrickLink names
 * Brickognize returned for the same photos, with the recorded visual score
 * and whether the two really are the same figure.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { namesAgree } from '../../electron/services/catalog'

const rb = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/rebrickable/minifigs.json'), 'utf8')) as Record<string, { name: string }>
const bkFigs = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/brickognize/figs.json'), 'utf8')) as { items: { id: string; name: string }[] }
const blItems = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/bricklink/items.json'), 'utf8')) as Record<string, { name: string }>

const TABLE: [rebrickable: string, bricklink: string, score: number, sameFigure: boolean][] = [
  [rb['fig-002544'].name, bkFigs.items.find((i) => i.id === 'sw1034')!.name, 0.73, true],
  [rb['fig-002514'].name, blItems['MINIFIG/sw0700'].name, 0.63, true],
  [rb['fig-011300'].name, 'Aunt May - Light Bluish Gray Sweater', 0.79, true],
  [rb['fig-012978'].name, 'Tavern Keeper - Male, Reddish Brown Apron', 0.84, true],
  [rb['fig-012980'].name, 'Peasant - Female, Dark Green Skirt, White', 0.71, false],
  [rb['fig-013153'].name, 'Kuiil - Brick Built Backpack', 0.81, true],
  [rb['fig-014271'].name, 'The Architect of Hogwarts', 0.65, true],
  [rb['fig-010388'].name, 'AT-AT Driver - Dark Red Imperial Logo, Flat Silver Helmet', 0.72, false],
]

describe('namesAgree (recorded Rebrickable vs. BrickLink names)', () => {
  it('uses the full catalog names from the fixtures', () => {
    expect(TABLE.map(([name]) => name)).toEqual([
      'BB-8',
      'C-3PO, Pearl Gold, Colorful Wires, Printed Legs',
      'Aunt May, Light Bluish Gray Sweater',
      'Castle Man, Reddish Brown Apron, Dark Brown Hair',
      'Castle Woman, Dark Green Dress, White Headdress',
      'Kuill',
      'Hogwarts Architect',
      'AT-AT Driver, Sand Blue Uniform, 3626cpr0937 Head',
    ])
  })

  it.each(TABLE)('%s ↔ %s (score %s) → same figure: %s', (rebrickable, bricklink, score, sameFigure) => {
    expect(namesAgree(rebrickable, bricklink, score)).toBe(sameFigure)
  })

  it('tells variants of one character apart even when the character name matches', () => {
    // Same character, different uniform: the other recorded AT-AT Driver variant
    expect(namesAgree(rb['fig-011942'].name, 'AT-AT Driver - Dark Red Imperial Logo, Flat Silver Helmet', 0.72)).toBe(false)
    expect(namesAgree(rb['fig-011942'].name, 'AT-AT Driver - Sand Blue Uniform, Imperial Logo', 0.72)).toBe(true)
  })

  it('needs a strong visual score before differently-worded names can agree', () => {
    expect(namesAgree('Castle Man, Reddish Brown Apron, Dark Brown Hair', 'Tavern Keeper - Male, Reddish Brown Apron', 0)).toBe(false)
    expect(namesAgree('Castle Man, Reddish Brown Apron, Dark Brown Hair', 'Tavern Keeper - Male, Reddish Brown Apron', 0.5)).toBe(false)
  })

  it('rejects unrelated figures', () => {
    expect(namesAgree('BB-8', 'C-3PO - Colorful Wires, Printed Legs', 0.9)).toBe(false)
    expect(namesAgree('Harry Lime', 'Amber Grant', 0.95)).toBe(false)
  })
})
