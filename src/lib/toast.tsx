/**
 * Toasts in the app's own style, with an optional action ("Undo", "View").
 * Errors from the main process carry a code: a missing or rejected key gets
 * a "Settings" action that goes straight to the right place.
 */
import hot, { type Toast } from 'react-hot-toast'
import { CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppError } from './errors'

type Tone = 'success' | 'error' | 'info' | 'loading'

function Card({ t, tone, title, body, action }: { t: Toast; tone: Tone; title: ReactNode; body?: ReactNode; action?: { label: string; run: () => void } }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertTriangle : tone === 'loading' ? Loader2 : Info
  const color = tone === 'success' ? 'text-up' : tone === 'error' ? 'text-down' : 'text-accent-text'
  return (
    <div
      className="pointer-events-auto flex w-[360px] items-start gap-3 rounded-[14px] border border-line bg-panel-3 px-3.5 py-3 shadow-[var(--shadow-3)]"
      style={{ opacity: t.visible ? 1 : 0, transform: t.visible ? 'none' : 'translateY(8px) scale(.98)', transition: 'opacity .18s, transform .22s var(--ease-out)' }}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon className={`mt-px size-[18px] shrink-0 ${color} ${tone === 'loading' ? 'animate-spin' : ''}`} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-snug text-fg">{title}</div>
        {body && <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{body}</div>}
      </div>
      {action && (
        <button type="button" onClick={() => { hot.dismiss(t.id); action.run() }}
          className="shrink-0 rounded-[8px] px-2 py-1 text-[12.5px] font-semibold text-accent-text hover:bg-hover">{action.label}</button>
      )}
    </div>
  )
}

interface Opts { body?: ReactNode; action?: { label: string; run: () => void }; id?: string; duration?: number }

function show(tone: Tone, title: ReactNode, o: Opts = {}) {
  return hot.custom((t) => <Card t={t} tone={tone} title={title} body={o.body} action={o.action} />, {
    id: o.id,
    duration: o.duration ?? (tone === 'loading' ? Infinity : tone === 'error' ? 7000 : o.action ? 7000 : 3500),
  })
}

/** Set by the app shell, so error toasts can open Settings at the right section. */
let goToSettings: (section: string) => void = () => undefined
export function setSettingsNavigator(fn: (section: string) => void): void { goToSettings = fn }

export const toast = {
  success: (title: ReactNode, o?: Opts) => show('success', title, o),
  info: (title: ReactNode, o?: Opts) => show('info', title, o),
  loading: (title: ReactNode, o?: Opts) => show('loading', title, o),
  dismiss: (id?: string) => hot.dismiss(id),
  error(err: unknown, title = "That didn't work", o: Opts = {}) {
    const e = err instanceof AppError ? err : null
    const message = err instanceof Error ? err.message : String(err)
    const needsSettings = e && (e.code === 'missing_key' || e.code === 'auth')
    return show('error', needsSettings ? message : title, {
      ...o,
      body: needsSettings ? undefined : message,
      action: o.action ?? (needsSettings ? { label: 'Settings', run: () => goToSettings(e?.service === 'postgres' ? 'data' : 'connections') } : undefined),
    })
  },
}
