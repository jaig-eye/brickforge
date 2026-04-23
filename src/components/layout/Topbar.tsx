import { Minus, Square, X } from 'lucide-react'
import { useProfileStore } from '@/store/profile.store'
import { cn } from '@/lib/cn'

export function Topbar() {
  const { profile } = useProfileStore()

  const minimize = () => window.ipc.send('bf:window:minimize')
  const maximize = () => window.ipc.send('bf:window:maximize')
  const close = () => window.ipc.send('bf:window:close')

  return (
    <header
      className="h-10 flex items-center justify-between px-4 border-b border-[var(--color-surface-border)] bg-[var(--color-surface-raised)] select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold font-display text-[var(--color-accent)]">BrickForge</span>
        <span className="text-xs text-[var(--color-surface-muted)] font-mono">alpha</span>
      </div>

      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={minimize}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-[var(--color-surface-overlay)] transition-colors"
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          onClick={maximize}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-[var(--color-surface-overlay)] transition-colors"
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          onClick={close}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-500 hover:text-white transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  )
}
