import { BrowserWindow, Notification } from 'electron'

/** Send a push event to every open window. */
export function push(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** A Windows/macOS notification; clicking it focuses the app. Never throws. */
export function notifyDesktop(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body, silent: false })
    n.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.focus()
    })
    n.show()
  } catch {
    /* notifications are best effort */
  }
}
