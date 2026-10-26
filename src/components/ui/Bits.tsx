/** Small display pieces: chips, deltas, rings, count-ups, images, empty states. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, useReducedMotionConfig } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDelta, formatPct } from '@/lib/formatters'
import { IsoBrick } from '../brick/IsoBrick'

export function Chip({ children, tone = 'neutral', className, icon }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'up' | 'down' | 'warn' | 'info'; className?: string; icon?: ReactNode }) {
  const tones = {
    neutral: 'bg-panel-3 text-fg-2 border-line',
    accent: 'bg-accent-soft text-accent-text border-transparent',
    up: 'bg-up-soft text-up border-transparent',
    down: 'bg-down-soft text-down border-transparent',
    warn: 'bg-warn-soft text-warn border-transparent',
    info: 'bg-info-soft text-info border-transparent',
  }
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11.5px] font-medium [&>svg]:size-3', tones[tone], className)}>
      {icon}{children}
    </span>
  )
}

/** ▲ +$12.30 · +4.1% — color and arrow carry the direction, not just the sign. */
export function Delta({ value, pct, size = 'sm', className, showPct = true }: { value: number | null; pct?: number | null; size?: 'sm' | 'md'; className?: string; showPct?: boolean }) {
  if (value == null) return <span className={cn('text-fg-4', className)}>—</span>
  const dir = value > 0.004 ? 'up' : value < -0.004 ? 'down' : 'flat'
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus
  return (
    <span className={cn('tnum inline-flex items-center gap-0.5 font-mono font-medium', size === 'sm' ? 'text-[12px]' : 'text-[13.5px]',
      dir === 'up' ? 'text-up' : dir === 'down' ? 'text-down' : 'text-fg-3', className)}>
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      {formatDelta(value)}
      {showPct && pct != null && <span className="opacity-75">&nbsp;{formatPct(pct)}</span>}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-4 animate-spin text-accent', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Determinate progress ring (0–1). */
export function Ring({ value, size = 18, stroke = 2.5, className, track = 'var(--line-strong)' }: { value: number; size?: number; stroke?: number; className?: string; track?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className={className} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.5s var(--ease-out)' }} />
    </svg>
  )
}

/** Confidence as a ring with a number in it. */
export function Confidence({ value, size = 40 }: { value: number; size?: number }) {
  const pct = Math.round(value * 100)
  const tone = value >= 0.8 ? 'var(--up)' : value >= 0.5 ? 'var(--warn)' : 'var(--fg-4)'
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} title={`${pct}% confident`}>
      <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="tnum font-mono text-[11px] font-semibold" style={{ color: tone }}>{pct}</span>
    </div>
  )
}

/** A number that counts up to its value on first show and glides on change. */
export function Ticker({ value, format, className, duration = 1.4 }: { value: number; format: (n: number) => ReactNode; className?: string; duration?: number }) {
  const reduce = useReducedMotionConfig()
  const [shown, setShown] = useState(reduce ? value : 0)
  const from = useRef(reduce ? value : 0)
  useEffect(() => {
    if (reduce) { setShown(value); return }
    const controls = animate(from.current, value, {
      duration: from.current === 0 ? duration : 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(v),
    })
    from.current = value
    return () => controls.stop()
  }, [value, reduce, duration])
  return <span className={cn('tnum', className)}>{format(shown)}</span>
}

/** Product image on a white plate; a brick stands in when there's no image. */
export function ItemImage({ src, alt, className, pad = 'p-3', fallbackColor = '#8c93a8' }: { src: string | null | undefined; alt: string; className?: string; pad?: string; fallbackColor?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={cn('plate relative grid place-items-center overflow-hidden', className)}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)}
          className={cn('size-full object-contain mix-blend-multiply', pad)} />
      ) : (
        <svg viewBox="0 0 60 50" className="w-1/2 opacity-70" aria-hidden="true">
          <IsoBrick w={2} d={2} color={fallbackColor} x={30} y={26} s={10} />
        </svg>
      )}
    </div>
  )
}

export function Empty({ scene, title, children, actions, className }: { scene: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="mb-5 w-[220px] max-w-full">{scene}</div>
      <h3 className="font-display text-[19px] font-bold">{title}</h3>
      {children && <div className="mt-2 max-w-[440px] text-[13.5px] leading-relaxed text-fg-3">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ title, sub, action, className }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="font-display text-[15px] font-bold tracking-[-0.01em]">{title}</h3>
        {sub && <p className="mt-0.5 text-[12px] text-fg-3">{sub}</p>}
      </div>
      {action}
    </div>
  )
}
