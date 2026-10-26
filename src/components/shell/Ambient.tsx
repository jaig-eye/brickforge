import { useEffect, useRef } from 'react'

/**
 * Night Studio's living light: very slow drifting color behind everything,
 * and a stud grid that lights up only around the pointer. Pointer tracking
 * writes CSS variables directly (no React renders), throttled to one frame.
 */
export function Ambient() {
  const studs = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    let x = 0, y = 0
    const onMove = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        studs.current?.style.setProperty('--mx', `${x}px`)
        studs.current?.style.setProperty('--my', `${y}px`)
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame) }
  }, [])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-[-25%] blur-[90px]">
        <i className="absolute left-[4%] top-[2%] aspect-square w-[38%] rounded-full" style={{ background: 'var(--aurora-1)', animation: 'drift 28s ease-in-out infinite alternate' }} />
        <i className="absolute right-[2%] top-[22%] aspect-square w-[34%] rounded-full" style={{ background: 'var(--aurora-2)', animation: 'drift 34s ease-in-out -9s infinite alternate' }} />
        <i className="absolute bottom-[0%] left-[30%] aspect-square w-[40%] rounded-full" style={{ background: 'var(--aurora-3)', animation: 'drift 39s ease-in-out -17s infinite alternate' }} />
      </div>
      <div
        ref={studs}
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle at center, var(--stud) 0 2.1px, transparent 2.7px)',
          backgroundSize: '22px 22px',
          WebkitMaskImage: 'radial-gradient(240px circle at var(--mx, -999px) var(--my, -999px), #000 0%, transparent 72%)',
          maskImage: 'radial-gradient(240px circle at var(--mx, -999px) var(--my, -999px), #000 0%, transparent 72%)',
        }}
      />
    </div>
  )
}
