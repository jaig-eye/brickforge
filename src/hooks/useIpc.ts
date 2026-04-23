import { useEffect } from 'react'
import { IPC, type IpcChannel } from '@/lib/ipc-types'

export function useIpcEvent(channel: IpcChannel, fn: (...args: unknown[]) => void): void {
  useEffect(() => {
    const off = window.ipc.on(channel, fn)
    return off
  }, [channel, fn])
}

export async function ipc<T = unknown>(channel: IpcChannel, ...args: unknown[]): Promise<T> {
  return window.ipc.invoke(channel, ...args) as Promise<T>
}

export { IPC }
