import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ipc', {
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),

  on: (channel: string, fn: (...args: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => fn(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  send: (channel: string, ...args: unknown[]) =>
    ipcRenderer.send(channel, ...args),
})

// Expose app info
contextBridge.exposeInMainWorld('appInfo', {
  platform: process.platform,
  version: process.env.npm_package_version ?? '0.1.0',
})
