import { dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { IPC } from '../../src/lib/ipc-types'
import { AppError } from '../../src/lib/errors'
import type { ImportItem, ImportPreview } from '../../src/lib/types'
import { backupDb, listBackups, backupPath, restoreDb } from '../db/index'
import { runMigrations } from '../db/migrate'
import { readCollectionFile, importItems, collectionCsv } from '../services/importer'
import { readListPhoto } from '../services/identify'
import { dataHealth, enrichCollection } from '../services/catalog'
import { push } from '../services/notify'
import { resyncAfterRestore } from '../services/sync'
import { handle, str, obj, photo } from './handle'

const parent = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

function cleanItems(v: unknown): ImportItem[] {
  return (Array.isArray(v) ? v : []).slice(0, 5000).flatMap((raw) => {
    const i = obj<ImportItem>(raw)
    if (typeof i.number !== 'string' || !i.number.trim()) return []
    const price = Number(i.price)
    return [{
      kind: i.kind === 'minifig' ? 'minifig' as const : 'set' as const,
      number: i.number.trim().slice(0, 40),
      quantity: Math.max(1, Math.min(999, Math.floor(Number(i.quantity) || 1))),
      wanted: i.wanted === true,
      condition: typeof i.condition === 'string' ? i.condition.slice(0, 30) : undefined,
      price: Number.isFinite(price) && price > 0 ? price : null,
      notes: typeof i.notes === 'string' ? i.notes.slice(0, 2000) : null,
      acquired_date: typeof i.acquired_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(i.acquired_date) ? i.acquired_date : undefined,
      bricklink_id: typeof i.bricklink_id === 'string' && i.bricklink_id.trim() ? i.bricklink_id.trim().slice(0, 40) : undefined,
      has_box: typeof i.has_box === 'boolean' ? i.has_box : undefined,
      has_instructions: typeof i.has_instructions === 'boolean' ? i.has_instructions : undefined,
      missing_parts: typeof i.missing_parts === 'string' ? i.missing_parts.slice(0, 2000) : undefined,
      tags: Array.isArray(i.tags) ? i.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim().slice(0, 40)).slice(0, 20) : undefined,
    }]
  })
}

export function registerDataHandlers(): void {
  handle(IPC.DATA_EXPORT_CSV, async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(parent(), {
      title: 'Export your collection',
      defaultPath: `brickforge-collection-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (canceled || !filePath) return { canceled: true as const }
    const { csv, sets, figs } = collectionCsv()
    fs.writeFileSync(filePath, csv, 'utf8')
    return { canceled: false as const, fileName: path.basename(filePath), sets, figs }
  })

  // The file is chosen in a main-process dialog; the renderer never names a path
  handle(IPC.DATA_IMPORT_PICK, async (): Promise<ImportPreview> => {
    const { canceled, filePaths } = await dialog.showOpenDialog(parent(), {
      title: 'Import a collection file',
      filters: [{ name: 'Collection files', extensions: ['csv', 'xml'] }, { name: 'All files', extensions: ['*'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths[0]) return { canceled: true }
    const parsed = readCollectionFile(filePaths[0])
    return { canceled: false, fileName: path.basename(filePaths[0]), format: parsed.format, items: parsed.items.slice(0, 5000), skipped: parsed.skipped }
  })
  handle(IPC.DATA_IMPORT_PHOTO, (b64: unknown) => readListPhoto(photo(b64)))
  handle(IPC.DATA_IMPORT_RUN, (items: unknown, as?: unknown) => importItems(cleanItems(items), as === 'wanted' ? 'wanted' : 'owned'))

  handle(IPC.DATA_BACKUP_NOW, async () => {
    const p = await backupDb('manual')
    if (!p) throw new AppError({ code: 'internal', message: "The backup couldn't be written. Check free disk space." })
    return path.basename(p)
  })
  handle(IPC.DATA_BACKUP_LIST, () => listBackups())
  /** Restore a listed backup by name, or pick a .db file when no name is given. */
  handle(IPC.DATA_BACKUP_RESTORE, async (name?: unknown) => {
    let target: string | null
    if (typeof name === 'string' && name) {
      target = backupPath(str(name, 200))
      if (!target) throw new AppError({ code: 'not_found', message: 'That backup no longer exists.' })
    } else {
      const { canceled, filePaths } = await dialog.showOpenDialog(parent(), {
        title: 'Restore from a backup file',
        filters: [{ name: 'BrickForge backup', extensions: ['db'] }],
        properties: ['openFile'],
      })
      if (canceled || !filePaths[0]) return { restored: false }
      target = filePaths[0]
    }
    await restoreDb(target)
    // An older backup is brought up to the current schema before anything reads it
    await runMigrations()
    await resyncAfterRestore()
    push(IPC.PUSH_DATA_CHANGED, { kind: 'all' })
    return { restored: true }
  })

  handle(IPC.DATA_HEALTH, () => dataHealth())
  handle(IPC.DATA_ENRICH, () => enrichCollection())
}
