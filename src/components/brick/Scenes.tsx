/**
 * Small animated isometric scenes for empty and idle states — the app's
 * "little scenes" in place of grey icons. Each one plays once (scan's sweep
 * is the exception: it's the page's subject).
 */
import { IsoBrick, isoOffset } from './IsoBrick'

const S = 13

function Plate({ w = 6, d = 4, x = 120, y = 70 }: { w?: number; d?: number; x?: number; y?: number }) {
  return <IsoBrick w={w} d={d} h={0.4} color="#22B36B" x={x} y={y} s={S} />
}

/** An empty baseplate getting its first bricks. */
export function SceneBuild({ className }: { className?: string }) {
  const [ax, ay] = isoOffset(1, 1, 0.4, S)
  const [bx, by] = isoOffset(3, 1, 0.4, S)
  const [cx, cy] = isoOffset(2, 1, 1.6, S)
  return (
    <svg viewBox="0 0 240 150" className={className} aria-hidden="true">
      <Plate />
      <IsoBrick w={2} d={2} color="#FFC929" x={120 + ax} y={70 + ay} s={S} drop delay={0.15} />
      <IsoBrick w={2} d={2} color="#2F7FEA" x={120 + bx} y={70 + by} s={S} drop delay={0.45} />
      <IsoBrick w={2} d={2} color="#E5373C" x={120 + cx} y={70 + cy} s={S} drop delay={0.8} />
    </svg>
  )
}

/** A magnifying glass over a lone brick: nothing matched. */
export function SceneSearch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} aria-hidden="true">
      <Plate w={4} d={3} x={110} y={78} />
      <IsoBrick w={2} d={1} color="#FF8A3D" x={110 + isoOffset(1, 1, 0.4, S)[0]} y={78 + isoOffset(1, 1, 0.4, S)[1]} s={S} drop delay={0.1} />
      <g className="brick-drop" style={{ animationDelay: '0.5s', transformOrigin: '160px 60px' }}>
        <circle cx="160" cy="54" r="22" fill="var(--accent-soft)" stroke="var(--fg-2)" strokeWidth="5" />
        <path d="M176 70 L196 92" stroke="var(--fg-2)" strokeWidth="8" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/** A framed brick with a light sweep: ready to scan. */
export function SceneScan({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sweep" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <clipPath id="frame"><rect x="66" y="18" width="108" height="114" rx="10" /></clipPath>
      </defs>
      <g fill="none" stroke="var(--fg-3)" strokeWidth="3" strokeLinecap="round">
        <path d="M66 38 V22 Q66 18 70 18 H86" /><path d="M154 18 H170 Q174 18 174 22 V38" />
        <path d="M174 112 V128 Q174 132 170 132 H154" /><path d="M86 132 H70 Q66 132 66 128 V112" />
      </g>
      <IsoBrick w={2} d={2} color="#FFC929" x={120} y={78} s={S + 3} drop delay={0.1} />
      <g clipPath="url(#frame)">
        <rect x="66" y="-30" width="108" height="34" fill="url(#sweep)">
          <animate attributeName="y" values="-30;132;-30" dur="3.2s" repeatCount="indefinite" />
        </rect>
      </g>
    </svg>
  )
}

/** A price tag swinging from a brick: no prices yet. */
export function ScenePrice({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} aria-hidden="true">
      <Plate w={4} d={3} x={100} y={80} />
      <IsoBrick w={2} d={2} color="#2F7FEA" x={100 + isoOffset(1, 0.5, 0.4, S)[0]} y={80 + isoOffset(1, 0.5, 0.4, S)[1]} s={S} drop delay={0.1} />
      <g style={{ transformOrigin: '150px 44px', animation: 'tag-swing 2.4s var(--ease-out) 0.5s both' }}>
        <path d="M150 44 L170 66" stroke="var(--fg-3)" strokeWidth="2" />
        <path d="M160 64 h34 a6 6 0 0 1 6 6 v18 a6 6 0 0 1 -6 6 h-34 l-12 -15 z" fill="var(--accent)" />
        <circle cx="160" cy="79" r="3.2" fill="var(--panel)" />
        <text x="185" y="84" textAnchor="middle" fontSize="13" fontWeight="800" fontFamily="var(--font-display)" fill="var(--accent-ink)">$</text>
      </g>
      <style>{'@keyframes tag-swing { 0% { transform: rotate(-28deg); opacity: 0 } 30% { opacity: 1 } 55% { transform: rotate(10deg) } 75% { transform: rotate(-5deg) } 100% { transform: rotate(0) } }'}</style>
    </svg>
  )
}

/** A key leaning on a brick: something needs setting up. */
export function SceneKey({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} aria-hidden="true">
      <Plate w={4} d={3} x={110} y={80} />
      <IsoBrick w={2} d={2} color="#E5373C" x={110 + isoOffset(1, 0.5, 0.4, S)[0]} y={80 + isoOffset(1, 0.5, 0.4, S)[1]} s={S} drop delay={0.1} />
      <g className="brick-drop" style={{ animationDelay: '0.45s' }} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round">
        <circle cx="70" cy="62" r="14" />
        <path d="M80 72 L112 104 M100 92 L108 84 M106 98 L112 92" />
      </g>
    </svg>
  )
}

/** A bell with a check: everything's quiet. */
export function SceneQuiet({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} aria-hidden="true">
      <Plate w={4} d={3} x={120} y={84} />
      <g className="brick-drop" style={{ animationDelay: '0.2s' }}>
        <path d="M120 30 c-16 0 -26 12 -26 28 v18 l-8 10 h68 l-8 -10 v-18 c0 -16 -10 -28 -26 -28 z" fill="var(--panel-3)" stroke="var(--fg-3)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M112 92 a8 8 0 0 0 16 0" fill="none" stroke="var(--fg-3)" strokeWidth="3" />
        <path d="M110 58 l7 7 l13 -14" fill="none" stroke="var(--up)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
