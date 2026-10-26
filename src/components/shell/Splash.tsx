import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotionConfig } from 'framer-motion'
import { useUi } from '@/lib/ui-store'
import { BrickLogo, Wordmark } from '../brick/BrickLogo'

/**
 * The launch moment: the logo brick drops onto its plate and the studs pop,
 * then the studio fades in. About a second, once per launch.
 */
export function Splash({ ready }: { ready: boolean }) {
  const done = useUi((s) => s.splashDone)
  const finish = useUi((s) => s.setSplashDone)
  const reduce = useReducedMotionConfig()

  useEffect(() => {
    if (!ready || done) return
    const t = setTimeout(finish, reduce ? 0 : 1050)
    return () => clearTimeout(t)
  }, [ready, done, finish, reduce])

  return (
    <AnimatePresence>
      {!done && (
        <motion.div key="splash" data-splash className="fixed inset-0 z-[100] grid place-items-center bg-bg"
          exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeOut' } }}>
          <div className="flex flex-col items-center gap-4">
            <BrickLogo size={104} animate />
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.4 }}>
              <Wordmark className="text-[26px]" />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
