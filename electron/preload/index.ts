import { contextBridge, ipcRenderer } from 'electron'

/**
 * The only bridge between the page and the main process. Only BrickForge's
 * own namespaced channels cross it, and the IpcRendererEvent never reaches
 * the page (listeners get the payload only). Runs sandboxed: no Node APIs.
 */
const isAllowed = (channel: unknown): channel is string => typeof channel === 'string' && channel.startsWith('bf:')

contextBridge.exposeInMainWorld('ipc', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!isAllowed(channel)) return Promise.reject(new Error(`Blocked IPC channel: ${String(channel)}`))
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, fn: (...args: unknown[]) => void) => {
    if (!isAllowed(channel) || typeof fn !== 'function') return () => undefined
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => fn(...args)
    ipcRenderer.on(channel, listener)
    return () => { ipcRenderer.removeListener(channel, listener) }
  },
  send: (channel: string, ...args: unknown[]) => {
    if (isAllowed(channel)) ipcRenderer.send(channel, ...args)
  },
})
