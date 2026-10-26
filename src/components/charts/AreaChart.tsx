/**
 * The value chart: a line that draws itself in, a soft area fill, a faint
 * grid, an emphasized endpoint, and a crosshair that reads out any day.
 * Plain SVG on one shared scale — no chart library.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotionConfig } from 'framer-motion'
import { formatMoney, formatMoneyCompact, formatShortDate } from '@/lib/formatters'

export interface SeriesPoint { day: string; value: number }

function niceTicks(min: number, max: number, count = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (max - min < 1e-6) return [min]
  const step0 = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0
  const ticks: number[] = []
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(t)
  return ticks
}

export function AreaChart({ data, height = 190, color = 'var(--accent)', className, format = formatMoney }: {
  data: SeriesPoint[]
  height?: number
  color?: string
  className?: string
  format?: (n: number) => string
}) {
  const id = useId().replace(/:/g, '')
  const reduce = useReducedMotionConfig()
  const wrap = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  // Drawn at the real pixel width, so text and strokes are never stretched
  const [W, setW] = useState(640)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setW(Math.max(200, Math.round(el.clientWidth)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = height, padL = 4, padR = 54, padT = 14, padB = 24

  const geo = useMemo(() => {
    if (!data.length) return null
    const vals = data.map((d) => d.value)
    let min = Math.min(...vals), max = Math.max(...vals)
    const span = max - min || Math.max(1, max * 0.05)
    min -= span * 0.18
    max += span * 0.12
    const x = (i: number) => padL + (data.length === 1 ? (W - padL - padR) : (i / (data.length - 1)) * (W - padL - padR))
    const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB)
    const pts = data.map((d, i) => [x(i), y(d.value)] as const)
    // A single point still draws: a flat line across
    const line = pts.length === 1
      ? `M${padL},${pts[0][1]} L${W - padR},${pts[0][1]}`
      : pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
    const last = pts.length === 1 ? [W - padR, pts[0][1]] as const : pts[pts.length - 1]
    const area = `${line} L${last[0]},${H - padB} L${pts.length === 1 ? padL : pts[0][0]},${H - padB} Z`
    const ticks = niceTicks(min + span * 0.18, max - span * 0.12)
    const labelIdx = data.length <= 2 ? [0, data.length - 1] : [0, Math.floor((data.length - 1) / 2), data.length - 1]
    return { x, y, pts, line, area, last, ticks: ticks.map((t) => ({ t, y: y(t) })), labelIdx: [...new Set(labelIdx)] }
  }, [data, H, W])

  if (!geo) return <div ref={wrap} style={{ height }} className={className} />

  const onMove = (e: React.PointerEvent) => {
    const rect = wrap.current?.getBoundingClientRect()
    if (!rect || data.length < 2) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - padL) / (W - padL - padR)) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }
  const hp = hover != null ? geo.pts[hover] : null

  return (
    <div ref={wrap} className={className} style={{ position: 'relative' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block overflow-visible" role="img"
        aria-label={`Value from ${formatMoney(data[0].value)} on ${formatShortDate(data[0].day)} to ${formatMoney(data[data.length - 1].value)} on ${formatShortDate(data[data.length - 1].day)}`}>
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {geo.ticks.map(({ t, y }) => (
          <g key={t}>
            <line x1={0} x2={W - padR + 8} y1={y} y2={y} stroke="var(--line)" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
            <text x={W - 2} y={y + 3.5} textAnchor="end" fontSize="10.5" fill="var(--fg-4)" fontFamily="var(--font-mono)">{formatMoneyCompact(t)}</text>
          </g>
        ))}
        {geo.labelIdx.map((i) => (
          <text key={i} x={i === 0 ? padL : i === data.length - 1 ? W - padR : geo.x(i)} y={H - 6} fontSize="10.5" fill="var(--fg-4)" fontFamily="var(--font-mono)"
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>{formatShortDate(data[i].day)}</text>
        ))}
        <motion.path d={geo.area} fill={`url(#fill-${id})`} initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, delay: 0.5 }} />
        <motion.path d={geo.line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: [0.4, 0, 0.2, 1], delay: 0.15 }} />
        <circle cx={geo.last[0]} cy={geo.last[1]} r="4" fill={color} />
        {!reduce && (
          <circle cx={geo.last[0]} cy={geo.last[1]} r="4" fill={color} opacity="0.35">
            <animate attributeName="r" values="4;13" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.35;0" dur="2.4s" repeatCount="indefinite" />
          </circle>
        )}
        {hp && (
          <g pointerEvents="none">
            <line x1={hp[0]} x2={hp[0]} y1={padT - 6} y2={H - padB} stroke="var(--fg-3)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            <circle cx={hp[0]} cy={hp[1]} r="4.5" fill="var(--panel)" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {hover != null && hp && (
        <div className="pointer-events-none absolute -top-2 rounded-[10px] border border-line bg-panel-3 px-2.5 py-1.5 shadow-[var(--shadow-2)]"
          style={{ left: `${(hp[0] / W) * 100}%`, transform: `translate(${hp[0] / W > 0.7 ? '-105%' : '8%'}, 0)` }}>
          <div className="tnum font-mono text-[12.5px] font-semibold text-fg">{format(data[hover].value)}</div>
          <div className="text-[11px] text-fg-3">{formatShortDate(data[hover].day)}</div>
        </div>
      )}
    </div>
  )
}

/** A tiny trend line for list rows. */
export function Sparkline({ values, width = 64, height = 22, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return <svg width={width} height={height} className={className} aria-hidden="true" />
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <path d={d} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
