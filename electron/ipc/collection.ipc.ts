import { IPC } from '../../src/lib/ipc-types'
import type { CollectionQuery, SetPatch, FigPatch, AddOptions, CatalogFig } from '../../src/lib/types'
import { AppError } from '../../src/lib/errors'
import {
  listSets, listFigs, updateSet, updateFig, deleteItems, restoreItems, bulkUpdate, collectionThemes, ownershipIndex,
  listTags, tagItems, untagItems, deleteTag, renameTag, getFig, type DeletedRow, type BulkPatch,
} from '../db/queries/collection.queries'
import { browseSets, browseMinifigs, getThemes, getMinifigSets } from '../api/rebrickable'
import { getBricklinkItem, bricklinkImageUrl } from '../api/bricklink'
import { looksLikeBricklinkFigId } from '../../src/lib/lego-ids'
import { addSetByNumber, addFigFromCatalog, inspectSet, ensureFigBricklinkId, figIdsForResults } from '../services/catalog'
import { handle, str, optStr, int, ids, kind, obj } from './handle'

function query(v: unknown): CollectionQuery {
  const q = obj<CollectionQuery>(v)
  return {
    scope: q.scope === 'wanted' || q.scope === 'all' ? q.scope : 'owned',
    search: optStr(q.search, 120),
    theme: optStr(q.theme, 120),
    condition: optStr(q.condition, 40),
    tag: optStr(q.tag, 60),
    sort: optStr(q.sort, 20) as CollectionQuery['sort'],
    dir: q.dir === 'asc' ? 'asc' : 'desc',
  }
}

function addOptions(v: unknown): AddOptions {
  const o = obj<AddOptions>(v)
  const price = Number(o.acquired_price)
  return {
    as: o.as === 'wanted' ? 'wanted' : 'owned',
    condition: optStr(o.condition, 40),
    acquired_price: Number.isFinite(price) && price > 0 ? price : null,
    quantity: Math.max(1, Math.min(999, Math.floor(Number(o.quantity) || 1))),
    notes: optStr(o.notes, 2000) ?? null,
  }
}

export function registerCollectionHandlers(): void {
  handle(IPC.SETS_LIST, (q?: unknown) => listSets(query(q)))
  handle(IPC.FIGS_LIST, (q?: unknown) => listFigs(query(q)))
  handle(IPC.SET_UPDATE, (id: unknown, patch: unknown) => updateSet(int(id), obj<SetPatch>(patch)))
  handle(IPC.FIG_UPDATE, (id: unknown, patch: unknown) => updateFig(int(id), obj<FigPatch>(patch)))
  handle(IPC.ADD_SET, (setNumber: unknown, opts: unknown) => addSetByNumber(str(setNumber, 30), addOptions(opts)))
  handle(IPC.ADD_FIG, (fig: unknown, opts: unknown) => {
    const f = obj<CatalogFig & { bricklink_id?: string | null; theme?: string | null; year?: number | null }>(fig)
    const num = str(f.set_num, 40).trim()
    if (!num) throw new AppError({ code: 'invalid_input', message: 'Missing minifigure number.' })
    return addFigFromCatalog({
      fig_number: num,
      name: optStr(f.name, 300) || num,
      image_url: optStr(f.set_img_url, 600) ?? (looksLikeBricklinkFigId(num) ? bricklinkImageUrl('M', num) : null),
      bricklink_id: optStr(f.bricklink_id, 40) ?? null,
      theme: optStr(f.theme, 120) ?? null,
      year: Number.isInteger(f.year) ? f.year : null,
    }, addOptions(opts))
  })
  handle(IPC.ITEMS_DELETE, (k: unknown, list: unknown) => deleteItems(kind(k), ids(list)))
  handle(IPC.ITEMS_RESTORE, (k: unknown, rows: unknown) => restoreItems(kind(k), Array.isArray(rows) ? (rows as DeletedRow[]) : []))
  handle(IPC.ITEMS_BULK_UPDATE, (k: unknown, list: unknown, patch: unknown) => bulkUpdate(kind(k), ids(list), obj<BulkPatch>(patch)))
  handle(IPC.COLLECTION_THEMES, () => collectionThemes())
  handle(IPC.OWNERSHIP, () => ownershipIndex())
  handle(IPC.FIG_SETS, (figNumber: unknown) => getMinifigSets(str(figNumber, 40)))
  /** Find a minifig's BrickLink id (and its catalog record when keys are set). */
  handle(IPC.FIG_RESOLVE_BL, async (id: unknown) => {
    const fig = getFig(int(id))
    if (!fig) throw new AppError({ code: 'not_found', message: 'That minifigure is no longer in your collection.' })
    const blId = fig.bricklink_id ?? await ensureFigBricklinkId(fig.rebrickable_id ?? fig.fig_number)
    if (!blId) return { bricklink_id: null, item: null }
    return { bricklink_id: blId, item: await getBricklinkItem('MINIFIG', blId).catch(() => null) }
  })

  handle(IPC.TAGS_LIST, () => listTags())
  handle(IPC.TAGS_APPLY, (k: unknown, numbers: unknown, tags: unknown) =>
    tagItems(kind(k), (Array.isArray(numbers) ? numbers : []).map((n) => str(n, 40)), (Array.isArray(tags) ? tags : []).map((t) => str(t, 40))))
  handle(IPC.TAGS_REMOVE, (k: unknown, numbers: unknown, tag: unknown) =>
    untagItems(kind(k), (Array.isArray(numbers) ? numbers : []).map((n) => str(n, 40)), str(tag, 40)))
  handle(IPC.TAG_DELETE, (name: unknown) => deleteTag(str(name, 40)))
  handle(IPC.TAG_RENAME, (from: unknown, to: unknown) => renameTag(str(from, 40), str(to, 40)))

  // ── Catalog ────────────────────────────────────────────────────────────────
  handle(IPC.CATALOG_SETS, (o?: unknown) => {
    const opts = obj<{ search: string; theme_id: number; page: number; ordering: string; setsOnly: boolean }>(o)
    return browseSets({
      search: optStr(opts.search, 120), theme_id: Number.isInteger(opts.theme_id) ? opts.theme_id : null,
      page: Math.max(1, Math.floor(Number(opts.page) || 1)), page_size: 30,
      ordering: ['-year', 'year', 'name', '-name', '-num_parts', 'num_parts'].includes(String(opts.ordering)) ? opts.ordering : '-year',
      setsOnly: opts.setsOnly !== false,
    })
  })
  handle(IPC.CATALOG_FIGS, (o?: unknown) => {
    const opts = obj<{ search: string; theme_id: number; page: number }>(o)
    return browseMinifigs({
      search: optStr(opts.search, 120), theme_id: Number.isInteger(opts.theme_id) ? opts.theme_id : null,
      page: Math.max(1, Math.floor(Number(opts.page) || 1)), page_size: 30, ordering: 'name',
    })
  })
  handle(IPC.CATALOG_THEMES, () => getThemes())
  handle(IPC.CATALOG_SET_DETAIL, (setNumber: unknown) => inspectSet(str(setNumber, 30)))
  handle(IPC.CATALOG_FIG_IDS, (list: unknown) => figIdsForResults((Array.isArray(list) ? list : []).slice(0, 60).map((r) => {
    const o = obj<{ id: string; name: string }>(r)
    return { id: str(o.id, 40), name: str(o.name ?? '', 300) }
  })))
}
