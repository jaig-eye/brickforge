import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import * as TT from '@radix-ui/react-tooltip'
import { BellRing } from 'lucide-react'
import { api } from '@/lib/api'
import { IPC } from '@/lib/ipc-types'
import { useQueryClient } from '@tanstack/react-query'
import { useSettings, useAppInfo, usePushSync, useSummary, keys } from '@/lib/queries'
import { setSettingsNavigator, toast } from '@/lib/toast'
import { formatMoney } from '@/lib/formatters'
import { useUi } from '@/lib/ui-store'
import type { ImportProgress, TriggeredAlert } from '@/lib/types'
import { TitleBar } from './TitleBar'
import { Rail } from './Rail'
import { Ambient } from './Ambient'
import { Splash } from './Splash'
import { FlyLayer } from './FlyLayer'
import { CommandBar } from './CommandBar'
import { Onboarding } from './Onboarding'
import { AddDialog } from '../collection/AddDialog'
import { ItemSheet } from '../collection/ItemSheet'

/** Keeps <html> in step with the theme, accent, and motion preferences. */
function useThemeSync() {
  const { data: s } = useSettings()
  useEffect(() => {
    if (!s) return
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      root.dataset.theme = s.theme === 'system' ? (media.matches ? 'dark' : 'light') : s.theme
      root.dataset.accent = s.accent
      const reduced = s.reduceMotion === 'on' || (s.reduceMotion === 'system' && reducedMedia.matches)
      root.dataset.motion = reduced ? 'reduced' : 'full'
    }
    apply()
    media.addEventListener('change', apply)
    reducedMedia.addEventListener('change', apply)
    return () => { media.removeEventListener('change', apply); reducedMedia.removeEventListener('change', apply) }
  }, [s])
  return s
}

/** Alerts, import progress: events that can happen on any screen. */
function useGlobalEvents() {
  const openSheet = useUi((s) => s.openSheet)
  const navigate = useNavigate()
  useEffect(() => {
    setSettingsNavigator((section) => navigate(`/settings#${section}`))
    const offAlerts = api.on<TriggeredAlert[]>(IPC.PUSH_ALERTS, (fired) => {
      for (const a of fired.slice(0, 3)) {
        toast.info(<span className="inline-flex items-center gap-1.5"><BellRing className="size-4 text-accent-text" />{a.name ?? a.entity_id}</span>, {
          body: `${a.direction === 'above' ? 'Rose to' : 'Dropped to'} ${formatMoney(a.current_price)} (${a.condition}). Your target: ${formatMoney(a.target_price)}.`,
          action: { label: 'View', run: () => openSheet(a.entity_type, a.entity_id) },
          duration: 12_000,
        })
      }
    })
    const offImport = api.on<ImportProgress>(IPC.PUSH_IMPORT, (p) => {
      if (p.current) toast.loading(`Importing ${p.done + 1} of ${p.total}`, { id: 'import', body: p.current })
      else toast.dismiss('import')
    })
    return () => { offAlerts(); offImport() }
  }, [navigate, openSheet])
}

/**
 * Windows' "Animation effects" switch reaches apps as reduced motion, and
 * many people turn it off for speed, not comfort. Say so once, and offer to
 * turn motion on for BrickForge alone.
 */
function useMotionHint(enabled: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    let seen = false
    try { seen = localStorage.getItem('bf-motion-hint') === '1' } catch { /* storage unavailable */ }
    if (seen || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    try { localStorage.setItem('bf-motion-hint', '1') } catch { /* storage unavailable */ }
    const t = setTimeout(() => toast.info('Animations are off in Windows', {
      body: 'BrickForge is following that setting and keeping still.',
      action: { label: 'Turn on here', run: async () => qc.setQueryData(keys.settings, await api.settings.setPrefs({ reduceMotion: 'off' })) },
      duration: 12_000,
    }), 2500)
    return () => clearTimeout(t)
  }, [enabled, qc])
}

export function AppShell() {
  const settings = useThemeSync()
  const { data: info } = useAppInfo()
  const { data: summary } = useSummary()
  usePushSync()
  useGlobalEvents()
  const location = useLocation()
  const ready = !!settings && !!info && !!summary
  const reduceMotion = settings?.reduceMotion === 'on' ? 'always' : settings?.reduceMotion === 'off' ? 'never' : 'user'
  const showOnboarding = ready && !settings.onboardingDone && !info.demo && summary.sets_owned + summary.figs_owned + summary.wanted_count === 0
  useMotionHint(ready && !showOnboarding && settings.reduceMotion === 'system')

  return (
    <MotionConfig reducedMotion={reduceMotion}>
      <TT.Provider delayDuration={350}>
        <Ambient />
        <div className="flex h-full flex-col">
          <TitleBar />
          <div className="flex min-h-0 flex-1">
            <Rail />
            <main className="relative min-w-0 flex-1">
              <AnimatePresence mode="wait" initial={false}>
                <Outlet key={location.pathname} />
              </AnimatePresence>
            </main>
          </div>
        </div>
        <AddDialog />
        <ItemSheet />
        <CommandBar />
        <FlyLayer />
        {showOnboarding && <Onboarding />}
        <Splash ready={ready} />
        <Toaster position="bottom-right" containerStyle={{ bottom: 18, right: 18 }} gutter={10} />
      </TT.Provider>
    </MotionConfig>
  )
}
