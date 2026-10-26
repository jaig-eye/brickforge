/**
 * Which desktop the interface is running on, for the few places that differ:
 * shortcut labels, the window controls, and naming the system's own settings.
 */
export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)

/** The system's name, as in "Match Windows" or "Match macOS". */
export const osName = isMac ? 'macOS' : 'Windows'

/** A shortcut label with the platform's modifier: "Ctrl K" or "⌘K". */
export const shortcut = (key: string) => (isMac ? `⌘${key}` : `Ctrl ${key}`)
