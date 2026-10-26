import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Moon, Sun, Monitor, FolderOpen, DatabaseBackup, History, FileUp, FileDown, Wand2, Download, RefreshCw, FlaskConical, ExternalLink, Check, LogOut } from 'lucide-react'
import { api } from '@/lib/api'
import { keys, useSettings, useAppInfo, useBackups, useHealth, useUpdateState, useRefreshStatus, useSyncStatus, invalidateCollection } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { formatAgo, formatDate } from '@/lib/formatters'
import { cn } from '@/lib/cn'
import type { Preferences } from '@/lib/types'
import { Page, Rise } from '@/components/shell/Page'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { Switch } from '@/components/ui/Menu'
import { Confirm } from '@/components/ui/Overlay'
import { Chip, Ring } from '@/components/ui/Bits'
import { RebrickableCard, BricklinkCard, AiCard, BrickognizeCard } from '@/components/settings/Connections'
import { SyncCard } from '@/components/settings/SyncCard'
import { ImportDialog } from '@/components/collection/ImportDialog'
import { BrickLogo } from '@/components/brick/BrickLogo'

const SECTIONS = [
  { id: 'you', label: 'You' },
  { id: 'connections', label: 'Connections' },
  { id: 'prices', label: 'Prices' },
  { id: 'data', label: 'Your data' },
  { id: 'about', label: 'About' },
] as const

const ACCENTS = [
  { id: 'yellow', color: '#FFC929', label: 'Yellow' },
  { id: 'red', color: '#E5373C', label: 'Red' },
  { id: 'blue', color: '#2F7FEA', label: 'Blue' },
  { id: 'green', color: '#22B36B', label: 'Green' },
] as const

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="font-display text-[21px] font-extrabold tracking-[-0.02em]">{title}</h2>
      {sub && <p className="mt-1 text-[13px] text-fg-3">{sub}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-0">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[12.5px] text-fg-3">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export default function Settings() {
  const qc = useQueryClient()
  const location = useLocation()
  const { data: s } = useSettings()
  const [active, setActive] = useState<string>('you')
  const [name, setName] = useState('')
  useEffect(() => { if (s) setName(s.displayName) }, [s?.displayName]) // keep the field in step with saved settings
  useEffect(() => {
    const id = location.hash.replace('#', '')
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250)
  }, [location.hash])
  useEffect(() => {
    const root = document.querySelector('[data-scroll-root]')
    if (!root) return
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (top) setActive(top.target.id)
    }, { root, rootMargin: '-10% 0px -70% 0px' })
    SECTIONS.forEach((x) => { const el = document.getElementById(x.id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [])

  const setPrefs = async (patch: Preferences) => qc.setQueryData(keys.settings, await api.settings.setPrefs(patch))
  if (!s) return null

  return (
    <Page title="Settings" sub="Everything is stored on this PC. Keys are encrypted and never leave it, except to the service they belong to.">
      <div className="grid grid-cols-[180px_1fr] items-start gap-10">
        <nav className="sticky top-2 flex flex-col gap-0.5" aria-label="Settings sections">
          {SECTIONS.map((x) => (
            <button key={x.id} type="button" onClick={() => document.getElementById(x.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={cn('rounded-[10px] px-3 py-2 text-left text-[13.5px] transition-colors', active === x.id ? 'bg-hover font-semibold text-fg' : 'text-fg-3 hover:text-fg')}>
              {x.label}
            </button>
          ))}
        </nav>

        <div className="flex max-w-[860px] flex-col gap-12">
          <Rise>
            <Section id="you" title="You">
              <div className="panel px-5">
                <Row label="Your name" hint="Used in greetings. Optional.">
                  <form onSubmit={(e) => { e.preventDefault(); void setPrefs({ displayName: name }) }}>
                    <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== s.displayName && void setPrefs({ displayName: name })} className="w-[220px]" placeholder="First name" />
                  </form>
                </Row>
                <Row label="Appearance">
                  <Segmented label="Theme" value={s.theme} onChange={(theme) => void setPrefs({ theme })}
                    options={[
                      { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon className="size-3.5" />Dark</span> },
                      { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun className="size-3.5" />Light</span> },
                      { value: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor className="size-3.5" />Match Windows</span> },
                    ]} />
                </Row>
                <Row label="Brick color" hint="The accent used for buttons, highlights, and the chart line.">
                  <div className="flex gap-2">
                    {ACCENTS.map((a) => (
                      <button key={a.id} type="button" aria-label={a.label} aria-pressed={s.accent === a.id} onClick={() => void setPrefs({ accent: a.id })}
                        className={cn('relative grid size-10 place-items-center rounded-[12px] transition-transform hover:-translate-y-0.5', s.accent === a.id && 'ring-2 ring-fg ring-offset-2 ring-offset-[var(--panel)]')}
                        style={{ background: a.color, boxShadow: 'inset 0 -5px 0 rgb(0 0 0 / .18)' }}>
                        <span className="absolute -top-1.5 left-[7px] h-2 w-2.5 rounded-t-[3px]" style={{ background: a.color }} />
                        <span className="absolute -top-1.5 right-[7px] h-2 w-2.5 rounded-t-[3px]" style={{ background: a.color }} />
                        {s.accent === a.id && <Check className={cn('size-4', a.id === 'yellow' || a.id === 'green' ? 'text-black' : 'text-white')} strokeWidth={3} />}
                      </button>
                    ))}
                  </div>
                </Row>
                <Row label="Motion" hint="Animations like the vault count-up and scan sweep. “Match Windows” follows Windows' animation setting.">
                  <Segmented label="Motion" value={s.reduceMotion} onChange={(reduceMotion) => void setPrefs({ reduceMotion })}
                    options={[{ value: 'off', label: 'Full' }, { value: 'system', label: 'Match Windows' }, { value: 'on', label: 'Reduced' }]} />
                </Row>
              </div>
            </Section>
          </Rise>

          <Section id="connections" title="Connections" sub="Each one unlocks part of BrickForge. All are free except the AI providers' API keys.">
            <RebrickableCard />
            <BricklinkCard />
            <AiCard />
            <BrickognizeCard />
          </Section>

          <Prices />
          <DataSection />
          <About />
        </div>
      </div>
    </Page>
  )
}

function Prices() {
  const qc = useQueryClient()
  const { data: s } = useSettings()
  const { data: r } = useRefreshStatus()
  if (!s) return null
  return (
    <Section id="prices" title="Prices" sub="Market prices come from BrickLink sales in the last six months, US region, in US dollars.">
      <div className="panel px-5">
        <Row label="Update prices daily" hint="While BrickForge is open, prices for everything you own, want, or watch update once a day.">
          <Switch label="Update prices daily" checked={s.autoRefreshPrices} onCheckedChange={async (v) => qc.setQueryData(keys.settings, await api.settings.setPrefs({ autoRefreshPrices: v }))} />
        </Row>
        <Row label="Last update" hint={s.lastPriceRefreshAt ? `${formatAgo(s.lastPriceRefreshAt)} · ${formatDate(s.lastPriceRefreshAt)}` : 'Never'}>
          {r?.running ? (
            <span className="tnum flex items-center gap-2 text-[12.5px] text-fg-3"><Ring value={r.total ? r.done / r.total : 0} />{r.done}/{r.total}</span>
          ) : (
            <Button size="sm" icon={<RefreshCw className="size-3.5" />} disabled={!s.keys.bricklink.set} onClick={async () => { try { await api.prices.refresh() } catch (err) { toast.error(err) } }}>Update now</Button>
          )}
        </Row>
      </div>
    </Section>
  )
}

function DataSection() {
  const qc = useQueryClient()
  const { data: info } = useAppInfo()
  const { data: backups } = useBackups()
  const { data: health } = useHealth()
  const { data: sync } = useSyncStatus()
  const [restore, setRestore] = useState<string | null | false>(false)
  const [importOpen, setImportOpen] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const gaps = health ? health.figsMissingBlId + health.figsMissingDetails + health.setsMissingTheme : 0

  const backupNow = async () => {
    try { const n = await api.data.backupNow(); toast.success('Backup saved', { body: n }); await qc.invalidateQueries({ queryKey: keys.backups }) } catch (err) { toast.error(err) }
  }
  const doRestore = async (name?: string) => {
    const id = toast.loading('Restoring…')
    try {
      const r = await api.data.restore(name)
      toast.dismiss(id)
      if (r.restored) { await invalidateCollection(); await qc.invalidateQueries({ queryKey: keys.backups }); toast.success('Restored. A backup of what you had was saved first.') }
    } catch (err) { toast.dismiss(id); toast.error(err, "Couldn't restore") }
  }
  const enrich = async () => {
    setEnriching(true)
    try { const r = await api.data.enrich(); await qc.invalidateQueries({ queryKey: keys.health }); toast.success(r.fixed ? `Filled in ${r.fixed} item${r.fixed === 1 ? '' : 's'}` : 'Nothing more could be filled in') } catch (err) { toast.error(err) } finally { setEnriching(false) }
  }
  const exportCsv = async () => {
    try { const r = await api.data.exportCsv(); if (!r.canceled) toast.success('Exported', { body: `${r.sets} sets and ${r.figs} minifigures → ${r.fileName}` }) } catch (err) { toast.error(err) }
  }

  return (
    <Section id="data" title="Your data" sub="Your collection lives in one file on this PC. Back it up, move it, or sync it.">
      <div className="panel px-5">
        <Row label="Where it's stored" hint={<span className="selectable font-mono text-[11.5px]">{info?.dataDir}</span>}>
          <Button size="sm" icon={<FolderOpen className="size-3.5" />} onClick={() => void api.app.showDataFolder()}>Open folder</Button>
        </Row>
        <Row label="Import and export" hint="CSV from Brickset, Rebrickable, or BrickForge, BrickLink XML, or a photo of a list.">
          <div className="flex gap-2">
            <Button size="sm" icon={<FileUp className="size-3.5" />} onClick={() => setImportOpen(true)}>Import</Button>
            <Button size="sm" icon={<FileDown className="size-3.5" />} onClick={exportCsv}>Export CSV</Button>
          </div>
        </Row>
        <Row label="Missing details" hint={health ? (gaps ? `${health.setsMissingTheme} sets without a theme, ${health.figsMissingDetails} minifigures missing details, ${health.figsMissingBlId} without a BrickLink id.` : 'Everything has its catalog details.') : '…'}>
          <Button size="sm" icon={<Wand2 className="size-3.5" />} loading={enriching} disabled={!gaps} onClick={enrich}>Fill them in</Button>
        </Row>
      </div>

      <div className="panel p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-[16px] font-bold">Backups</h3>
            <p className="mt-1 text-[13px] text-fg-3">A copy is saved every week, before every update, and before any restore. The newest eight are kept.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" icon={<History className="size-3.5" />} onClick={() => setRestore(null)}>Restore from a file…</Button>
            <Button size="sm" variant="primary" icon={<DatabaseBackup className="size-3.5" />} onClick={backupNow}>Back up now</Button>
          </div>
        </div>
        <ul className="mt-4 flex flex-col">
          {(backups ?? []).map((b) => (
            <li key={b.name} className="flex items-center gap-3 border-t border-line py-2.5 text-[13px]">
              <Chip>{b.label === 'pre-migration' ? 'Before update' : b.label === 'pre-restore' ? 'Before restore' : b.label === 'weekly' ? 'Weekly' : b.label === 'manual' ? 'Manual' : b.label}</Chip>
              <span className="flex-1 text-fg-2">{formatDate(b.mtime)} · {formatAgo(b.mtime)}</span>
              <span className="tnum font-mono text-[11.5px] text-fg-4">{(b.size / 1024).toFixed(0)} KB</span>
              <Button size="sm" variant="ghost" onClick={() => setRestore(b.name)}>Restore</Button>
            </li>
          ))}
          {!backups?.length && <li className="border-t border-line py-3 text-[12.5px] text-fg-4">No backups yet.</li>}
        </ul>
      </div>

      <SyncCard />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <Confirm open={restore !== false} onOpenChange={(o) => !o && setRestore(false)} title="Restore this backup?" confirmLabel="Restore"
        body={<>Your collection will be replaced with {restore ? 'this backup' : 'the file you pick'}. A backup of what you have now is saved first, so you can undo this.{sync?.enabled ? ' Sync is on, so anything edited more recently on your database comes back after the restore. Turn sync off first if the backup should win.' : ''}</>}
        onConfirm={() => void doRestore(restore || undefined)} />
    </Section>
  )
}

function About() {
  const { data: info } = useAppInfo()
  const { data: update } = useUpdateState()
  const [confirmDemo, setConfirmDemo] = useState(false)
  return (
    <Section id="about" title="About">
      <div className="panel flex items-center gap-5 p-5">
        <BrickLogo size={56} />
        <div className="flex-1">
          <div className="font-display text-[18px] font-extrabold">BrickForge <span className="font-mono text-[13px] font-medium text-fg-3">v{info?.version}</span></div>
          <p className="text-[12.5px] text-fg-3">
            {!info?.packaged ? 'Running from source. Updates come from git.'
              : update?.status === 'checking' ? 'Checking for updates…'
              : update?.status === 'up-to-date' ? 'You have the latest version.'
              : update?.status === 'available' ? `Version ${update.version} is available.`
              : update?.status === 'downloading' ? `Downloading ${update.version}… ${update.percent}%`
              : update?.status === 'ready' ? `Version ${update.version} is ready to install.`
              : update?.status === 'error' ? update.message : 'Updates install from GitHub releases.'}
          </p>
        </div>
        {info?.packaged && (update?.status === 'available'
          ? <Button size="sm" variant="primary" icon={<Download className="size-3.5" />} onClick={() => void api.updates.download()}>Download</Button>
          : update?.status === 'ready'
            ? <Button size="sm" variant="primary" onClick={() => void api.updates.install()}>Restart and install</Button>
            : <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void api.updates.check()}>Check for updates</Button>)}
      </div>
      <div className="panel px-5">
        <Row label={info?.demo ? "You're in the demo" : 'Sample collection'} hint={info?.demo ? 'A separate sample collection. Your own collection is untouched.' : 'Try every screen with a sample collection, in its own space.'}>
          {info?.demo
            ? <Button size="sm" variant="primary" icon={<LogOut className="size-3.5" />} onClick={() => void api.app.exitDemo()}>Back to my collection</Button>
            : <Button size="sm" icon={<FlaskConical className="size-3.5" />} onClick={() => setConfirmDemo(true)}>Open the demo</Button>}
        </Row>
        <Row label="Source code" hint="Open source under the MIT license.">
          <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => void api.app.openExternal('https://github.com/jaig-eye/brickforge')}>GitHub</Button>
        </Row>
      </div>
      <p className="max-w-[720px] text-[11.5px] leading-relaxed text-fg-4">
        LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize, or endorse BrickForge. Catalog data and images from Rebrickable; market prices from BrickLink; image recognition by Brickognize.
      </p>
      <Confirm open={confirmDemo} onOpenChange={setConfirmDemo} title="Open the demo?" confirmLabel="Open the demo"
        body="BrickForge restarts with a sample collection in its own space. Come back to yours from Settings or the Demo badge." onConfirm={() => void api.app.enterDemo()} />
    </Section>
  )
}
