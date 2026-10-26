import { Minus, Square, X, Search, RefreshCw, CloudUpload, CloudAlert, Download, FlaskConical } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useUi } from '@/lib/ui-store'
import { useAppInfo, useRefreshStatus, useSyncStatus, useUpdateState } from '@/lib/queries'
import { Kbd } from '../ui/Field'
import { Ring } from '../ui/Bits'
import { Tip } from '../ui/Menu'
import { Wordmark } from '../brick/BrickLogo'

function WindowButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className={`no-drag grid h-[44px] w-[46px] place-items-center text-fg-3 transition-colors hover:text-fg ${danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-hover'}`}>
      {children}
    </button>
  )
}

export function TitleBar() {
  const setCommandOpen = useUi((s) => s.setCommandOpen)
  const navigate = useNavigate()
  const { data: info } = useAppInfo()
  const { data: refresh } = useRefreshStatus()
  const { data: sync } = useSyncStatus()
  const { data: update } = useUpdateState()

  return (
    <header className="drag relative z-30 flex h-[44px] shrink-0 items-center border-b border-line bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] pl-4 backdrop-blur-xl">
      <div className="flex w-[220px] items-center gap-2.5">
        <Wordmark />
        {info?.demo && (
          <Tip label="You're exploring a sample collection. Your own data is untouched.">
            <span className="no-drag inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info"><FlaskConical className="size-3" />Demo</span>
          </Tip>
        )}
      </div>

      <div className="flex flex-1 justify-center">
        <button type="button" onClick={() => setCommandOpen(true)}
          className="no-drag flex h-[30px] w-full max-w-[440px] items-center gap-2.5 rounded-[10px] border border-line bg-panel-2/70 px-3 text-[12.5px] text-fg-4 transition-colors hover:border-line-strong hover:text-fg-3">
          <Search className="size-[15px]" />
          <span className="flex-1 text-left">Search your collection, the catalog, or actions</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      </div>

      <div className="flex w-[220px] items-center justify-end">
        <div className="no-drag mr-2 flex items-center gap-1">
          {refresh?.running && (
            <Tip label={`Updating prices: ${refresh.done} of ${refresh.total}${refresh.current ? ` · ${refresh.current}` : ''}`}>
              <button type="button" onClick={() => navigate('/value')} className="flex h-[28px] items-center gap-1.5 rounded-[9px] px-2 text-[12px] text-fg-3 hover:bg-hover">
                <Ring value={refresh.total ? refresh.done / refresh.total : 0} size={16} />
                <span className="tnum">{refresh.done}/{refresh.total}</span>
              </button>
            </Tip>
          )}
          {sync?.enabled && (
            <Tip label={sync.state === 'error' ? `Sync problem: ${sync.lastError ?? 'unknown'}` : sync.state === 'syncing' ? 'Syncing with your database' : 'Synced with your database'}>
              <button type="button" onClick={() => navigate('/settings#data')} className="grid size-[28px] place-items-center rounded-[9px] text-fg-3 hover:bg-hover">
                {sync.state === 'error' ? <CloudAlert className="size-4 text-warn" /> : sync.state === 'syncing' ? <RefreshCw className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
              </button>
            </Tip>
          )}
          {(update?.status === 'available' || update?.status === 'ready') && (
            <Tip label={update.status === 'ready' ? `Version ${update.version} is ready: restart to finish` : `Version ${update.version} is available`}>
              <button type="button" onClick={() => (update.status === 'ready' ? api.updates.install() : navigate('/settings#about'))}
                className="flex h-[28px] items-center gap-1.5 rounded-[9px] bg-accent-soft px-2 text-[12px] font-semibold text-accent-text">
                <Download className="size-3.5" />{update.status === 'ready' ? 'Restart to update' : 'Update'}
              </button>
            </Tip>
          )}
        </div>
        <WindowButton label="Minimize" onClick={api.window.minimize}><Minus className="size-4" /></WindowButton>
        <WindowButton label="Maximize" onClick={api.window.maximize}><Square className="size-3.5" /></WindowButton>
        <WindowButton label="Close" onClick={api.window.close} danger><X className="size-4" /></WindowButton>
      </div>
    </header>
  )
}
