import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface PageShellProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

export function PageShell({ title, subtitle, actions, children }: PageShellProps) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex flex-col h-full overflow-hidden"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-surface-border)] shrink-0">
        <div>
          <h1 className="text-xl font-bold font-display leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-[var(--color-surface-muted)] mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </motion.div>
  )
}
