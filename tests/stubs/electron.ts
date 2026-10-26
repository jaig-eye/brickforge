/**
 * A stand-in for the parts of Electron the main process uses, so services and
 * IPC handlers run under plain Node in tests. ipcMain records handlers, and
 * tests call them through tests/helpers/ipc.ts exactly as the renderer would.
 */
import os from 'os'
import path from 'path'

type Handler = (event: unknown, ...args: unknown[]) => unknown

export const handlers = new Map<string, Handler>()
export const listeners = new Map<string, ((event: unknown, ...args: unknown[]) => void)[]>()
export const sent: { channel: string; payload: unknown }[] = []

export const ipcMain = {
  handle: (channel: string, fn: Handler) => { handlers.set(channel, fn) },
  removeHandler: (channel: string) => { handlers.delete(channel) },
  on: (channel: string, fn: (event: unknown, ...args: unknown[]) => void) => {
    listeners.set(channel, [...(listeners.get(channel) ?? []), fn])
  },
  removeAllListeners: (channel: string) => { listeners.delete(channel) },
}

const userData = () => process.env.BRICKFORGE_USER_DATA ?? path.join(os.tmpdir(), 'brickforge-test')

export const app = {
  getPath: (name: string) => (name === 'userData' ? userData() : name === 'appData' ? path.dirname(userData()) : os.tmpdir()),
  setPath: () => undefined,
  getVersion: () => '1.0.0',
  getAppPath: () => path.resolve(__dirname, '../..'),
  isPackaged: false,
  relaunch: () => undefined,
  exit: () => undefined,
  on: () => undefined,
}

// Reversible "encryption" so tests can see that secrets are never stored in plain text
export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(`sealed:${s}`).map((b) => b ^ 0x5a),
  decryptString: (b: Buffer) => Buffer.from(b.map((x) => x ^ 0x5a)).toString().replace(/^sealed:/, ''),
}

function fakeImage(buf?: Buffer) {
  return {
    isEmpty: () => true,
    getSize: () => ({ width: 0, height: 0 }),
    resize: () => fakeImage(buf),
    crop: () => fakeImage(buf),
    toJPEG: () => buf ?? Buffer.alloc(0),
    toPNG: () => buf ?? Buffer.alloc(0),
  }
}
export const nativeImage = { createFromBuffer: (buf: Buffer) => fakeImage(buf) }

const fakeWindow = {
  isDestroyed: () => false,
  webContents: { send: (channel: string, payload: unknown) => { sent.push({ channel, payload }) } },
}
export const BrowserWindow = {
  getAllWindows: () => [fakeWindow],
  getFocusedWindow: () => fakeWindow,
  fromWebContents: () => fakeWindow,
}

export class Notification {
  static isSupported(): boolean { return false }
  on(): void { /* no desktop notifications in tests */ }
  show(): void { /* no desktop notifications in tests */ }
}

export const dialog = {
  showSaveDialog: async () => ({ canceled: true, filePath: undefined as string | undefined }),
  showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }),
  showErrorBox: () => undefined,
}
// Typed like Electron's, so tests can vi.spyOn(shell, 'openExternal') and read the URL
export const shell = {
  openExternal: async (_url: string): Promise<void> => undefined,
  openPath: async (_path: string): Promise<string> => '',
}
export const session = { defaultSession: { setPermissionRequestHandler: () => undefined, setPermissionCheckHandler: () => undefined } }
export const screen = { getAllDisplays: () => [] }

export default { ipcMain, app, safeStorage, nativeImage, BrowserWindow, Notification, dialog, shell, session, screen }
