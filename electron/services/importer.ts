/**
 * Import and export. Reads Brickset, Rebrickable, and generic CSV exports and
 * BrickLink wanted-list XML; every import goes through a review step in the
 * UI first. Re-importing a file updates what it states and never duplicates.
 */
import fs from 'fs'
import { IPC } from '../../src/lib/ipc-types'
import { AppError } from '../../src/lib/errors'
import { isRebrickableFigNumber } from '../../src/lib/lego-ids'
import { normalizeSetCondition, normalizeFigCondition } from '../../src/lib/conditions'
import type { ImportItem, ImportResult, ImportProgress } from '../../src/lib/types'
import log from '../main/logger'
import { getMinifig } from '../api/rebrickable'
import { bricklinkImageUrl } from '../api/bricklink'
import {
  listSets, listFigs, getSetByNumber, findFig, updateSet, updateFig, tagItems,
} from '../db/queries/collection.queries'
import { addSetByNumber, addFigFromCatalog, enrichCollection } from './catalog'
import { push } from './notify'

// ── CSV ───────────────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvEscape(r[c])).join(','))].join('\r\n')
}

/** RFC-4180 CSV: quoted cells, escaped quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '')
const truthy = (s: string | undefined) => ['1', 'true', 'yes', 'y', 'x'].includes((s ?? '').trim().toLowerCase())

/** A yes/no cell: blank means the file doesn't say. */
const flag = (s: string | undefined) => {
  const v = (s ?? '').trim().toLowerCase()
  return v === '' ? undefined : truthy(v)
}

/** The extra columns a BrickForge export carries, so an export re-imports whole. */
function details(row: string[], c: Record<'dateCol' | 'blCol' | 'boxCol' | 'instrCol' | 'missingCol' | 'tagsCol', number>): Partial<ImportItem> {
  const cell = (i: number) => (i === -1 ? '' : (row[i] ?? '').trim())
  const out: Partial<ImportItem> = {}
  if (/^\d{4}-\d{2}-\d{2}$/.test(cell(c.dateCol))) out.acquired_date = cell(c.dateCol)
  if (cell(c.blCol)) out.bricklink_id = cell(c.blCol)
  if (c.boxCol !== -1 && flag(row[c.boxCol]) !== undefined) out.has_box = flag(row[c.boxCol])
  if (c.instrCol !== -1 && flag(row[c.instrCol]) !== undefined) out.has_instructions = flag(row[c.instrCol])
  if (cell(c.missingCol)) out.missing_parts = cell(c.missingCol)
  const tags = cell(c.tagsCol).split(';').map((t) => t.trim()).filter(Boolean)
  if (tags.length) out.tags = tags
  return out
}

/** Detect and parse a collection file's text. */
export function parseCollectionFile(raw: string): { format: string; items: ImportItem[]; skipped: number } {
  const text = raw.replace(/^﻿/, '')

  if (/^\s*</.test(text) && /<ITEM[\s>]/i.test(text)) {
    const items: ImportItem[] = []
    let skipped = 0
    for (const block of text.match(/<ITEM[\s>][\s\S]*?<\/ITEM>/gi) ?? []) {
      const grab = (tag: string) => new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, 'i').exec(block)?.[1].trim() ?? ''
      const type = grab('ITEMTYPE').toUpperCase()
      const id = grab('ITEMID')
      if (!id || (type && type !== 'S' && type !== 'M')) { skipped++; continue }
      items.push({
        kind: type === 'M' ? 'minifig' : 'set',
        number: id,
        quantity: Math.max(1, parseInt(grab('MINQTY') || grab('QTY') || '1', 10) || 1),
        wanted: true, // a wanted list is a wishlist by definition
        condition: grab('CONDITION') === 'N' ? 'new' : grab('CONDITION') === 'U' ? 'used' : undefined,
      })
    }
    return { format: 'BrickLink wanted list (XML)', items, skipped }
  }

  const rows = parseCsv(text)
  if (rows.length < 2) return { format: 'Empty file', items: [], skipped: 0 }
  const header = rows[0].map(norm)
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(norm(n))
      if (i !== -1) return i
    }
    return -1
  }
  const typeCol = col('type', 'kind', 'itemtype')
  const setCol = col('set num', 'set_num', 'setnumber', 'number', 'set', 'item number', 'itemid')
  const figCol = col('fig_num', 'fignumber', 'minifig', 'fig')
  const qtyCol = col('quantity', 'qty', 'qtyowned', 'quantityowned', 'owned')
  const wantCol = col('wanted', 'is_wanted', 'qtywanted', 'want', 'wishlist')
  const ownedFlagCol = col('is_owned')
  const condCol = col('condition', 'cond')
  const priceCol = col('acquired_price', 'pricepaid', 'paid', 'price', 'purchase price')
  const notesCol = col('notes', 'comments', 'note')
  const dateCol = col('acquired_date', 'date acquired')
  const blCol = col('bricklink_id')
  const boxCol = col('has_box')
  const instrCol = col('has_instructions')
  const missingCol = col('missing_parts')
  const tagsCol = col('tags')

  const isFigFile = figCol !== -1 && setCol === -1
  const numCol = isFigFile ? figCol : setCol
  if (numCol === -1) return { format: "Unrecognized CSV (no set or minifig number column)", items: [], skipped: rows.length - 1 }

  const items: ImportItem[] = []
  let skipped = 0
  for (const row of rows.slice(1)) {
    const num = (row[numCol] ?? '').trim()
    if (!num) { skipped++; continue }
    const typeVal = typeCol !== -1 ? (row[typeCol] ?? '').trim().toLowerCase() : ''
    const looksFig = typeVal === 'minifig' || typeVal === 'm' || isFigFile || /^fig-/.test(num) || /^[a-z]{2,6}\d{2,5}[a-z]?$/i.test(num)
    const wanted = wantCol !== -1
      ? truthy(row[wantCol]) && (ownedFlagCol === -1 || !truthy(row[ownedFlagCol]))
      : false
    const price = priceCol !== -1 ? parseFloat((row[priceCol] ?? '').replace(/[$,]/g, '')) : NaN
    items.push({
      kind: looksFig ? 'minifig' : 'set',
      number: num,
      quantity: qtyCol !== -1 ? Math.max(1, parseInt(row[qtyCol], 10) || 1) : 1,
      wanted,
      condition: condCol !== -1 ? (row[condCol] ?? '').trim().toLowerCase() || undefined : undefined,
      price: Number.isFinite(price) && price > 0 ? price : null,
      notes: notesCol !== -1 ? (row[notesCol] ?? '').trim() || null : null,
      ...details(row, { dateCol, blCol, boxCol, instrCol, missingCol, tagsCol }),
    })
  }
  const format = header.includes('type') && header.includes('isowned') ? 'BrickForge CSV'
    : header.includes('setnumber') || header.includes('qtyowned') ? 'Brickset CSV'
    : header.includes('setnum') ? 'Rebrickable CSV'
    : 'CSV'
  return { format, items, skipped }
}

export function readCollectionFile(filePath: string): { format: string; items: ImportItem[]; skipped: number } {
  const stat = fs.statSync(filePath)
  if (stat.size > 20_000_000) throw new AppError({ code: 'invalid_input', message: 'That file is over 20 MB, which is too big to be a collection export.' })
  return parseCollectionFile(fs.readFileSync(filePath, 'utf8'))
}

// ── Import ────────────────────────────────────────────────────────────────────

let importing = false

/** Apply the details a BrickForge export carries, and its tags, to the item now in the collection. */
function applyDetails(item: ImportItem, kind: 'set' | 'minifig', number: string): void {
  const yes = (b: boolean | undefined) => (b === undefined ? undefined : b ? 1 as const : 0 as const)
  if (kind === 'set') {
    const row = getSetByNumber(number)
    if (!row) return
    updateSet(row.id, { acquired_date: item.acquired_date, has_box: yes(item.has_box), has_instructions: yes(item.has_instructions), missing_parts: item.missing_parts })
  } else {
    const row = findFig(number, isRebrickableFigNumber(number) ? null : number)
    if (!row) return
    // A set's export row repeats its own number as the BrickLink id; only figs keep one
    updateFig(row.id, { acquired_date: item.acquired_date, bricklink_id: item.bricklink_id })
    number = row.fig_number
  }
  if (item.tags?.length) tagItems(kind, [number], item.tags)
}

/**
 * Import reviewed rows. New items are added; items you already have get only
 * the fields the file states (quantity, condition, price, notes, wishlist,
 * and the details and tags a BrickForge export carries).
 */
export async function importItems(items: ImportItem[], defaultAs: 'owned' | 'wanted'): Promise<ImportResult> {
  if (importing) throw new AppError({ code: 'invalid_input', message: 'An import is already running.' })
  importing = true
  const result: ImportResult = { imported: 0, updated: 0, failed: [] }
  const progress = (p: ImportProgress) => push(IPC.PUSH_IMPORT, p)
  try {
    for (const [i, item] of items.entries()) {
      progress({ done: i, total: items.length, current: item.number })
      const as = item.wanted ? 'wanted' : defaultAs
      try {
        if (item.kind === 'set') {
          const num = item.number.includes('-') ? item.number : `${item.number}-1`
          const existing = getSetByNumber(num)
          if (existing) {
            updateSet(existing.id, {
              quantity: item.quantity,
              ...(item.condition ? { condition: normalizeSetCondition(item.condition) } : {}),
              ...(item.price != null ? { acquired_price: item.price } : {}),
              ...(item.notes ? { notes: item.notes } : {}),
              ...(as === 'owned' ? { is_owned: 1 as const, is_wanted: 0 as const } : existing.is_owned ? {} : { is_wanted: 1 as const }),
            })
            result.updated++
          } else {
            await addSetByNumber(num, { as, condition: item.condition, acquired_price: item.price ?? null, quantity: item.quantity, notes: item.notes ?? null })
            result.imported++
          }
          applyDetails(item, 'set', num)
        } else {
          const existing = findFig(item.number, isRebrickableFigNumber(item.number) ? null : item.number)
          if (existing) {
            updateFig(existing.id, {
              quantity: item.quantity,
              ...(item.condition ? { condition: normalizeFigCondition(item.condition) } : {}),
              ...(item.price != null ? { acquired_price: item.price } : {}),
              ...(item.notes ? { notes: item.notes } : {}),
              ...(as === 'owned' ? { is_owned: 1 as const, is_wanted: 0 as const } : existing.is_owned ? {} : { is_wanted: 1 as const }),
            })
            result.updated++
          } else {
            // Rebrickable numbers have a catalog record; BrickLink ids get their
            // name filled in by background enrichment
            const rb = isRebrickableFigNumber(item.number) ? await getMinifig(item.number) : null
            if (isRebrickableFigNumber(item.number) && !rb) throw new AppError({ code: 'not_found', message: 'Not in the Rebrickable catalog' })
            addFigFromCatalog({
              fig_number: item.number,
              name: rb?.name ?? item.number,
              image_url: rb?.set_img_url ?? bricklinkImageUrl('M', item.number),
            }, { as, condition: item.condition, acquired_price: item.price ?? null, quantity: item.quantity, notes: item.notes ?? null })
            result.imported++
          }
          applyDetails(item, 'minifig', item.number)
        }
      } catch (err) {
        if (err instanceof AppError && (err.code === 'missing_key' || err.code === 'auth')) throw err
        result.failed.push({ number: item.number, reason: err instanceof Error ? err.message : String(err) })
        log.warn('[import] failed for', item.number, err)
      }
    }
  } finally {
    importing = false
    progress({ done: items.length, total: items.length, current: null })
    push(IPC.PUSH_DATA_CHANGED, { kind: 'all' })
  }
  void enrichCollection().catch(() => undefined)
  return result
}

// ── Export ────────────────────────────────────────────────────────────────────

export const EXPORT_COLUMNS = [
  'type', 'number', 'name', 'theme', 'year', 'condition', 'quantity', 'is_owned', 'is_wanted',
  'acquired_price', 'acquired_date', 'market_price', 'piece_count', 'bricklink_id', 'has_box',
  'has_instructions', 'missing_parts', 'tags', 'notes',
]

export function collectionCsv(): { csv: string; sets: number; figs: number } {
  const sets = listSets({ scope: 'all' }).map((s) => ({ ...s, type: 'set', number: s.set_number, tags: s.tags.join('; ') }))
  const figs = listFigs({ scope: 'all' }).map((f) => ({ ...f, type: 'minifig', number: f.fig_number, tags: f.tags.join('; ') }))
  return { csv: toCsv([...sets, ...figs] as unknown as Record<string, unknown>[], EXPORT_COLUMNS), sets: sets.length, figs: figs.length }
}
