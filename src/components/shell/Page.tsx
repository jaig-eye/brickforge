import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { pageVariants, riseItem } from '@/lib/motion'
import { cn } from '@/lib/cn'

/** Standard page frame: a header (title, one line of context, actions) and a scrolling body. */
export function Page({ title, sub, actions, children, className, wide }: {
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="enter" exit="exit" className="flex h-full min-h-0 flex-col">
      <div className="h-full overflow-y-auto" data-scroll-root>
        <div className={cn('mx-auto w-full px-8 pb-16 pt-7', wide ? 'max-w-[1600px]' : 'max-w-[1360px]', className)}>
          <motion.header variants={riseItem} className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.035em]">{title}</h1>
              {sub && <div className="mt-2 text-[13.5px] text-fg-3">{sub}</div>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </motion.header>
          {children}
        </div>
      </div>
    </motion.div>
  )
}

/** A block that rises in with the page's stagger. */
export function Rise({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div variants={riseItem} className={className}>{children}</motion.div>
}
