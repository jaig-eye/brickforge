import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  wide?: boolean
}

export function Dialog({ open, onClose, title, children, wide }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className={cn(
        'relative z-10 w-full rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)] shadow-2xl flex flex-col max-h-[85vh]',
        wide ? 'max-w-2xl' : 'max-w-lg',
      )}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-surface-border)] shrink-0">
            <h2 className="font-bold font-display text-base">{title}</h2>
            <button onClick={onClose} className="text-[var(--color-surface-muted)] hover:text-current transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  )
}
