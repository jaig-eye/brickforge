import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-8 text-center gap-4', className)}>
      {icon && (
        <div className="rounded-full bg-[var(--color-surface-overlay)] p-5 text-[var(--color-surface-muted)]">
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-base font-bold font-display">{title}</h3>
        {description && <p className="text-sm text-[var(--color-surface-muted)] mt-1 max-w-xs">{description}</p>}
      </div>
      {action}
    </div>
  )
}
