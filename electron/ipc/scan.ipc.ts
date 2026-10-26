import { IPC } from '../../src/lib/ipc-types'
import { listScanJobs, getScanEvalStats } from '../db/queries/scan.queries'
import { enqueuePhotos, retryJob, dismissJobs, clearFinished, acceptJob, jobThumbnail } from '../services/scan-queue'
import { identifyPiece } from '../services/identify'
import { handle, int, ids, obj, optStr, photo } from './handle'

export function registerScanHandlers(): void {
  handle(IPC.SCAN_ENQUEUE, (images: unknown, opts?: unknown) => {
    const o = obj<{ scanType: string; splitGroups: boolean }>(opts)
    const list = (Array.isArray(images) ? images : []).filter((x): x is string => typeof x === 'string').slice(0, 100)
    return { enqueued: enqueuePhotos(list, o.scanType === 'set' ? 'set' : 'minifig', o.splitGroups === true) }
  })
  handle(IPC.SCAN_LIST, () => listScanJobs())
  handle(IPC.SCAN_IMAGE, (id: unknown) => jobThumbnail(int(id)))
  handle(IPC.SCAN_RETRY, (id: unknown) => retryJob(int(id)))
  handle(IPC.SCAN_DISMISS, (list: unknown) => dismissJobs(ids(list, 500)))
  handle(IPC.SCAN_CLEAR, () => clearFinished())
  handle(IPC.SCAN_ACCEPT, (id: unknown, chosen?: unknown, auto?: unknown) => acceptJob(int(id), optStr(chosen, 40) ?? null, auto === true))
  handle(IPC.SCAN_PIECE, (b64: unknown) => identifyPiece(photo(b64)))
  handle(IPC.SCAN_STATS, () => getScanEvalStats())
}

