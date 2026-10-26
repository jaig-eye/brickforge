import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { SNAP } from '@/lib/motion'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

/**
 * A pill switcher whose highlight slides between options. The highlight is
 * one element animated to the measured position of the active option — not a
 * shared-layout (layoutId) animation, which can stall dialogs that close
 * while a switcher inside them has unmounted.
 */
export function Segmented<T extends string>({ value, onChange, options, size = 'md', className, label }: {
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
  size?: 'sm' | 'md'
  className?: string
  label: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)

  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!el) return
    const measure = () => setPill({ x: el.offsetLeft, w: el.offsetWidth })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, options.length])

  return (
    <div ref={wrap} role="tablist" aria-label={label} className={cn('no-drag relative inline-flex rounded-[12px] border border-line bg-panel-2 p-[3px]', className)}>
      {pill && (
        <motion.span aria-hidden="true" initial={false} animate={{ x: pill.x - 3, width: pill.w }} transition={SNAP}
          className="absolute left-[3px] top-[3px] bottom-[3px] rounded-[9px] border border-line-strong bg-panel-3 shadow-[var(--shadow-1)]" />
      )}
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-[9px] font-medium transition-colors duration-150',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3.5 text-[13px]',
              active ? 'text-fg' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            <span className="relative">{o.label}</span>
            {o.count != null && (
              <span className={cn('relative tnum rounded-full px-1.5 text-[11px]', active ? 'bg-accent-soft text-accent-text' : 'text-fg-4')}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
