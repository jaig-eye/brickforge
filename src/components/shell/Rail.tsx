import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, useAnimationControls } from 'framer-motion'
import { cn } from '@/lib/cn'
import { SNAP, BRICK } from '@/lib/motion'
import { useUi } from '@/lib/ui-store'
import { useScanJobs, useAlerts } from '@/lib/queries'
import { BrickLogo } from '../brick/BrickLogo'

/** Line pictograms drawn for BrickForge (24×24, 1.8 stroke). */
const ICONS: Record<string, React.ReactNode> = {
  home: <><path d="M4 11.2 12 4.8l8 6.4V19a1.2 1.2 0 0 1-1.2 1.2H15v-5.6H9v5.6H5.2A1.2 1.2 0 0 1 4 19z" /></>,
  collection: <><rect x="3.4" y="9.6" width="17.2" height="10.2" rx="1.8" /><rect x="5.9" y="5.8" width="4.3" height="3.8" rx="1" /><rect x="13.8" y="5.8" width="4.3" height="3.8" rx="1" /></>,
  catalog: <><path d="M4 5.4h5.8A2.2 2.2 0 0 1 12 7.6v12.6a2.2 2.2 0 0 0-2.2-2.2H4z" /><path d="M20 5.4h-5.8A2.2 2.2 0 0 0 12 7.6v12.6a2.2 2.2 0 0 1 2.2-2.2H20z" /></>,
  scan: <><path d="M4 8.2V5.6A1.6 1.6 0 0 1 5.6 4h2.6M15.8 4h2.6A1.6 1.6 0 0 1 20 5.6v2.6M20 15.8v2.6a1.6 1.6 0 0 1-1.6 1.6h-2.6M8.2 20H5.6A1.6 1.6 0 0 1 4 18.4v-2.6" /><path d="M4 12h16" /></>,
  value: <><path d="M4 18.6 9.4 13l3.6 3.4L20 9" /><path d="M15 9h5v5" /></>,
  sell: <><path d="M3.6 12.6V5.1a1.5 1.5 0 0 1 1.5-1.5h7.5l8.6 8.6-8.4 8.4z" /><circle cx="8.4" cy="8.4" r="1.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.6M12 18.6v2.6M4.1 7.4l2.2 1.3M17.7 15.3l2.2 1.3M4.1 16.6l2.2-1.3M17.7 8.7l2.2-1.3" /></>,
}

const NAV = [
  { to: '/', key: 'home', label: 'Home' },
  { to: '/collection', key: 'collection', label: 'Collection' },
  { to: '/catalog', key: 'catalog', label: 'Catalog' },
  { to: '/scan', key: 'scan', label: 'Scan' },
  { to: '/value', key: 'value', label: 'Value' },
  { to: '/sell', key: 'sell', label: 'Sell' },
] as const

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

function NavItem({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: number }) {
  const { pathname } = useLocation()
  const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
  const controls = useAnimationControls()
  const bump = useUi((s) => s.bump)
  const setTarget = useUi((s) => s.setCollectionTarget)
  const ref = useRef<HTMLAnchorElement>(null)

  // The Collection icon is the landing pad for "fly home", and pops on arrival
  useEffect(() => {
    if (icon !== 'collection') return
    const measure = () => ref.current && setTarget(ref.current.getBoundingClientRect())
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [icon, setTarget])
  useEffect(() => {
    if (icon === 'collection' && bump > 0) void controls.start({ scale: [1, 1.22, 1], rotate: [0, -6, 0], transition: { ...BRICK, duration: 0.5 } })
  }, [bump, icon, controls])

  return (
    <NavLink ref={ref} to={to} end={to === '/'} aria-label={label}
      className={cn('no-drag group relative flex w-[58px] flex-col items-center gap-1 rounded-[14px] pb-1.5 pt-2 transition-colors duration-150',
        active ? 'text-accent-ink' : 'text-fg-3 hover:text-fg')}>
      {active && <motion.span layoutId="rail-active" transition={SNAP} className="absolute inset-x-[7px] top-1 h-[38px] rounded-[12px] bg-accent shadow-[0_10px_26px_-12px_var(--accent-glow)]" />}
      {!active && <span className="absolute inset-x-[7px] top-1 h-[38px] rounded-[12px] opacity-0 transition-opacity group-hover:bg-hover group-hover:opacity-100" />}
      <motion.span animate={controls} className="relative mt-[3px] grid h-[30px] place-items-center"><Icon name={icon} /></motion.span>
      <span className={cn('relative text-[10.5px] font-semibold tracking-[0.01em]', active ? 'text-fg' : '')}>{label}</span>
      {!!badge && (
        <span className="tnum absolute right-[9px] top-[3px] grid h-[17px] min-w-[17px] place-items-center rounded-full bg-down px-1 text-[10px] font-bold text-white ring-2 ring-bg">{badge > 9 ? '9+' : badge}</span>
      )}
    </NavLink>
  )
}

export function Rail() {
  const { data: jobs } = useScanJobs()
  const { data: alerts } = useAlerts()
  const pendingScans = jobs?.filter((j) => j.status === 'done').length ?? 0
  const firedAlerts = alerts?.filter((a) => a.triggered_at).length ?? 0
  const splashDone = useUi((s) => s.splashDone)

  return (
    <nav aria-label="Main" className="relative z-20 flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-line bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] pb-3 pt-2 backdrop-blur-xl">
      <div className="mb-3 mt-1 grid place-items-center" title="BrickForge">
        <BrickLogo size={40} animate={!splashDone} />
      </div>
      {NAV.map((n) => (
        <NavItem key={n.to} to={n.to} icon={n.key} label={n.label}
          badge={n.key === 'scan' ? pendingScans : n.key === 'value' ? firedAlerts : undefined} />
      ))}
      <div className="flex-1" />
      <NavItem to="/settings" icon="settings" label="Settings" />
    </nav>
  )
}
