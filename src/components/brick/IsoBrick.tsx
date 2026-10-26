/**
 * Isometric LEGO-style bricks drawn as SVG. One generator draws every brick
 * in the app — the logo, nav pictograms, empty-state scenes — so they share
 * the same light: top face brightest, left face mid, right face in shadow.
 */
import { memo } from 'react'

const COS30 = Math.cos(Math.PI / 6)
const SIN30 = 0.5

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)))))
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

export interface BrickSpec {
  /** Studs wide (x) and deep (y). */
  w: number
  d: number
  /** Height in stud units: 1.2 = brick, 0.4 = plate. */
  h?: number
  color: string
  /** Origin on the canvas, and pixels per stud. */
  x?: number
  y?: number
  s?: number
  studs?: boolean
  /** Line-art mode (instruction-manual style). */
  line?: string
  /** Animate: drop in, then pop studs one by one starting at this delay (s). */
  drop?: boolean
  delay?: number
  className?: string
}

function project(x0: number, y0: number, s: number) {
  return (x: number, y: number, z: number): [number, number] => [x0 + (x - y) * COS30 * s, y0 + (x + y) * SIN30 * s - z * s]
}

const pts = (list: [number, number][]) => list.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(' ')

export const IsoBrick = memo(function IsoBrick({ w, d, h = 1.2, color, x = 0, y = 0, s = 12, studs = true, line, drop, delay = 0, className }: BrickSpec) {
  const P = project(x, y, s)
  const top = line ? 'var(--panel)' : shade(color, 0.12)
  const left = line ? 'var(--panel)' : shade(color, -0.1)
  const right = line ? 'var(--panel-2)' : shade(color, -0.3)
  const stroke = line ? { stroke: line, strokeWidth: 1.4, strokeLinejoin: 'round' as const } : {}

  const studList: [number, number][] = []
  if (studs) for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) studList.push([i, j])
  studList.sort((a, b) => a[0] + a[1] - (b[0] + b[1]))

  const r = 0.3
  const sh = 0.18
  const rx = r * Math.SQRT2 * COS30 * s
  const ry = r * Math.SQRT2 * SIN30 * s

  return (
    <g className={[drop ? 'brick-drop' : '', className].filter(Boolean).join(' ')} style={drop ? { animationDelay: `${delay}s` } : undefined}>
      <polygon points={pts([P(0, d, 0), P(w, d, 0), P(w, d, h), P(0, d, h)])} fill={left} {...stroke} />
      <polygon points={pts([P(w, 0, 0), P(w, d, 0), P(w, d, h), P(w, 0, h)])} fill={right} {...stroke} />
      <polygon points={pts([P(0, 0, h), P(w, 0, h), P(w, d, h), P(0, d, h)])} fill={top} {...stroke} />
      {studList.map(([i, j], k) => {
        const [cx, cyB] = P(i + 0.5, j + 0.5, h)
        const [, cyT] = P(i + 0.5, j + 0.5, h + sh)
        return (
          <g key={`${i}-${j}`} className={drop ? 'stud-pop' : undefined} style={drop ? { animationDelay: `${delay + 0.45 + k * 0.06}s` } : undefined}>
            <path
              d={`M${cx - rx},${cyT} L${cx - rx},${cyB} A${rx},${ry} 0 0 0 ${cx + rx},${cyB} L${cx + rx},${cyT} Z`}
              fill={line ? 'var(--panel)' : left}
              {...stroke}
            />
            <ellipse cx={cx} cy={cyT} rx={rx} ry={ry} fill={line ? 'var(--panel)' : shade(color, 0.26)} {...stroke} />
          </g>
        )
      })}
    </g>
  )
})

/** The screen offset of one stud-unit step, for stacking bricks precisely. */
export function isoOffset(dx: number, dy: number, dz: number, s: number): [number, number] {
  return [(dx - dy) * COS30 * s, (dx + dy) * SIN30 * s - dz * s]
}
