import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Package, TrendingUp, Camera, Puzzle,
  Wand2, User, Settings, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard'      },
  { to: '/collection', icon: Package,         label: 'Collection'     },
  { to: '/value',      icon: TrendingUp,      label: 'Value Tracker'  },
  { to: '/lookup',     icon: Camera,          label: 'Picture Lookup' },
  { to: '/piece-id',   icon: Puzzle,          label: 'Piece ID'       },
  { to: '/builder',    icon: Wand2,           label: 'AI Builder'     },
] as const

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore()
  const { isEnabled } = useFeatureFlags()

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 56 : 220 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex flex-col h-full border-r border-[var(--color-surface-border)] bg-[var(--color-surface-raised)] overflow-hidden shrink-0"
    >
      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-1">
        {NAV.map(({ to, icon: Icon, label }) => {
          const isPremium = to === '/builder' && !isEnabled('ai_builder')
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => cn(
                'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium font-display transition-all duration-150',
                isActive
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                  : 'text-current hover:bg-[var(--color-surface-overlay)]',
                isPremium && 'opacity-60'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom links */}
      <div className="px-2 pb-3 flex flex-col gap-1 border-t border-[var(--color-surface-border)] pt-2">
        {[
          { to: '/profile',  icon: User,     label: 'Profile'  },
          { to: '/settings', icon: Settings,  label: 'Settings' },
        ].map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium font-display transition-all duration-150',
              isActive
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                : 'text-current hover:bg-[var(--color-surface-overlay)]'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="whitespace-nowrap"
                >
                  {label}
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        ))}

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-[var(--color-surface-overlay)] transition-colors mt-1 text-[var(--color-surface-muted)]"
        >
          {sidebarCollapsed
            ? <ChevronRight className="h-4 w-4 shrink-0" />
            : <ChevronLeft className="h-4 w-4 shrink-0" />
          }
          {!sidebarCollapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </motion.aside>
  )
}
