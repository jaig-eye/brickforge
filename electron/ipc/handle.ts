/**
 * Every invoke handler goes through handle(): it removes any stale handler,
 * catches failures, and returns IpcResult so the renderer gets a typed
 * AppError instead of Electron's "Error invoking remote method…" string.
 */
import { ipcMain } from 'electron'
import { AppError, type IpcResult, type AppErrorShape } from '../../src/lib/errors'
import log from '../main/logger'

export function toErrorShape(err: unknown): AppErrorShape {
  if (err instanceof AppError) return err.toJSON()
  const message = err instanceof Error ? err.message : String(err)
  return { code: 'internal', message: message || 'Something went wrong.' }
}

export function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<IpcResult<R>> => {
    try {
      return { ok: true, data: await fn(...(args as A)) }
    } catch (err) {
      const error = toErrorShape(err)
      if (error.code === 'internal') log.error(`[ipc] ${channel} failed:`, err)
      else log.info(`[ipc] ${channel}: ${error.code} — ${error.message}`)
      return { ok: false, error }
    }
  })
}

// ── Argument guards: everything from the renderer is untrusted input ─────────

export function str(v: unknown, max = 500): string {
  if (typeof v !== 'string') throw new AppError({ code: 'invalid_input', message: 'Expected text.' })
  return v.slice(0, max)
}

export function optStr(v: unknown, max = 500): string | undefined {
  return typeof v === 'string' ? v.slice(0, max) : undefined
}

export function int(v: unknown): number {
  const n = Number(v)
  if (!Number.isInteger(n)) throw new AppError({ code: 'invalid_input', message: 'Expected a whole number.' })
  return n
}

export function ids(v: unknown, max = 5000): number[] {
  if (!Array.isArray(v)) throw new AppError({ code: 'invalid_input', message: 'Expected a list.' })
  return v.slice(0, max).map(Number).filter(Number.isInteger)
}

export function kind(v: unknown): 'set' | 'minifig' {
  if (v !== 'set' && v !== 'minifig') throw new AppError({ code: 'invalid_input', message: 'Expected "set" or "minifig".' })
  return v
}

export function cond(v: unknown): 'new' | 'used' {
  return v === 'new' ? 'new' : 'used'
}

export function obj<T extends object>(v: unknown): Partial<T> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Partial<T>) : {}
}

/** A photo sent as base64 (optionally a data URL), size-checked. */
export function photo(b64: unknown): Buffer {
  if (typeof b64 !== 'string' || b64.length < 100) throw new AppError({ code: 'invalid_input', message: 'That file is not an image.' })
  if (b64.length > 55_000_000) throw new AppError({ code: 'invalid_input', message: 'That photo is over 40 MB. Try a smaller one.' })
  return Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64')
}
