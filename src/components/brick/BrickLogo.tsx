import { IsoBrick } from './IsoBrick'

/**
 * The BrickForge mark: a yellow 2×2 brick snapped onto a red plate. With
 * `animate`, the brick drops and its studs pop in one by one — the launch
 * moment, shown once.
 */
export function BrickLogo({ size = 40, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <IsoBrick w={2} d={2} h={0.4} color="#E5373C" x={20} y={23} s={9} studs={false} drop={animate} />
      <IsoBrick w={2} d={2} h={1.2} color="#FFC929" x={20} y={19.4} s={9} drop={animate} delay={animate ? 0.18 : 0} />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-[17px] font-extrabold tracking-[-0.03em] ${className}`}>
      Brick<span className="text-accent-text">Forge</span>
    </span>
  )
}
