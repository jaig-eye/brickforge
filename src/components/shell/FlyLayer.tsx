import { AnimatePresence, motion, useReducedMotionConfig } from 'framer-motion'
import { useUi } from '@/lib/ui-store'
import { IsoBrick } from '../brick/IsoBrick'

/**
 * "Fly home": when something is added, its picture arcs from where you
 * clicked into the Collection icon, which pops on arrival. You always see
 * where the item went.
 */
export function FlyLayer() {
  const flights = useUi((s) => s.flights)
  const target = useUi((s) => s.collectionTarget)
  const land = useUi((s) => s.land)
  const reduce = useReducedMotionConfig()

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <AnimatePresence>
        {flights.map((f) => {
          const size = Math.min(96, Math.max(48, f.from.w * 0.6))
          const startX = f.from.x + f.from.w / 2 - size / 2
          const startY = f.from.y + f.from.h / 2 - size / 2
          const endX = (target ? target.left + target.width / 2 : 38) - size / 2
          const endY = (target ? target.top + 22 : 120) - size / 2
          return (
            <motion.div
              key={f.id}
              className="plate absolute left-0 top-0 grid place-items-center overflow-hidden rounded-[14px] shadow-[var(--shadow-3)]"
              style={{ width: size, height: size }}
              initial={{ x: startX, y: startY, scale: 1, opacity: 1 }}
              animate={reduce
                ? { x: endX, y: endY, scale: 0.2, opacity: 0, transition: { duration: 0.01 } }
                : {
                    x: [startX, (startX + endX) / 2, endX],
                    y: [startY, Math.min(startY, endY) - 90, endY],
                    scale: [1, 0.8, 0.22],
                    opacity: [1, 1, 0.2],
                    rotate: [0, -10, -20],
                    transition: { duration: 0.75, ease: [0.5, 0, 0.3, 1], times: [0, 0.45, 1] },
                  }}
              onAnimationComplete={() => land(f.id)}
            >
              {f.src
                ? <img src={f.src} alt="" className="size-full object-contain p-1.5 mix-blend-multiply" />
                : <svg viewBox="0 0 60 50" className="w-2/3"><IsoBrick w={2} d={2} color="#FFC929" x={30} y={26} s={10} /></svg>}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
