import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, RefreshCw, Camera, FileUp, ArrowRight, BellRing, Bell, CheckCircle2, CircleDashed, ScanLine } from 'lucide-react'
import { api } from '@/lib/api'
import { useSummary, usePortfolio, useMovers, useAlerts, useSets, useFigs, useSettings, useRefreshStatus, useScanJobs, useAppInfo } from '@/lib/queries'
import { useUi } from '@/lib/ui-store'
import { toast } from '@/lib/toast'
import { formatMoney, formatAgo, formatNumber, plural } from '@/lib/formatters'
import { cn } from '@/lib/cn'
import { Page, Rise } from '@/components/shell/Page'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Delta, Ticker, ItemImage, Empty, SectionTitle, Ring } from '@/components/ui/Bits'
import { AreaChart } from '@/components/charts/AreaChart'
import { SceneBuild, ScenePrice, SceneQuiet } from '@/components/brick/Scenes'

const RANGES = { '30d': 30, '90d': 90, '1y': 365, All: 3650 } as const
type Range = keyof typeof RANGES

function greeting(name: string): string {
  const h = new Date().getHours()
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}` : part
}

export default function Home() {
  const navigate = useNavigate()
  const openAdd = useUi((s) => s.openAdd)
  const { data: settings } = useSettings()
  const { data: summary } = useSummary()
  const { data: refresh } = useRefreshStatus()
  const owned = (summary?.sets_owned ?? 0) + (summary?.figs_owned ?? 0)

  const refreshNow = async () => {
    try { await api.prices.refresh() } catch (err) { toast.error(err, "Couldn't start the price update") }
  }

  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

  return (
    <Page
      title={greeting(settings?.displayName ?? '')}
      sub={owned ? `Here's your vault on ${today}.` : `Let's start your vault.`}
      actions={
        <>
          {settings?.keys.bricklink.set && owned > 0 && (
            <Button variant="ghost" onClick={refreshNow} disabled={refresh?.running}
              icon={refresh?.running ? <Ring value={refresh.total ? refresh.done / refresh.total : 0} size={16} /> : <RefreshCw className="size-4" />}>
              {refresh?.running ? `Updating ${refresh.done}/${refresh.total}` : 'Update prices'}
            </Button>
          )}
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openAdd()}>Add to vault</Button>
        </>
      }
    >
      {summary && owned === 0 && summary.wanted_count === 0 ? <FirstRun /> : (
        <div className="grid grid-cols-12 items-start gap-5">
          <Rise className="col-span-12 flex flex-col gap-5 xl:col-span-8">
            <Vault />
            <Recent />
          </Rise>
          <Rise className="col-span-12 flex flex-col gap-5 xl:col-span-4">
            <ScanStatus onOpen={() => navigate('/scan')} />
            <Movers />
            <Alerts />
            <Setup />
          </Rise>
        </div>
      )}
    </Page>
  )
}

function Vault() {
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>('90d')
  const { data: s } = useSummary()
  const { data: settings } = useSettings()
  const { data: history } = usePortfolio(RANGES[range])
  const series = useMemo(() => (history ?? []).map((p) => ({ day: p.day, value: p.total })), [history])
  if (!s) return <div className="skeleton h-[380px] rounded-[22px]" />
  const items = s.priced_items + s.unpriced_items

  return (
    <section className="panel relative overflow-hidden !rounded-[22px] p-6 pb-3">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 size-[320px] rounded-full bg-[var(--accent-soft)] blur-[70px]" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Vault value · {plural(s.sets_owned, 'set')} · {plural(s.figs_owned, 'minifig')}</div>
          <div className="mt-2 font-display text-[56px] font-extrabold leading-[0.95] tracking-[-0.045em]">
            <Ticker value={s.total_value} format={(n) => {
              const [whole, cents] = n.toFixed(2).split('.')
              return <>${Number(whole).toLocaleString('en-US')}<span className="text-[0.5em] text-fg-3">.{cents}</span></>
            }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-fg-3">
            {s.gain != null && (
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', s.gain >= 0 ? 'bg-up-soft' : 'bg-down-soft')}>
                <Delta value={s.gain} pct={s.gain_pct} size="md" />
                <span className="text-fg-3">on what you paid</span>
              </span>
            )}
            <span>{formatNumber(s.priced_items)} of {formatNumber(items)} items priced</span>
            {s.last_priced_at && <span>· updated {formatAgo(s.last_priced_at)}</span>}
          </div>
        </div>
        <Segmented size="sm" label="Chart range" value={range} onChange={setRange} options={(Object.keys(RANGES) as Range[]).map((r) => ({ value: r, label: r }))} />
      </div>
      <div className="relative mt-5">
        {series.length ? (
          <AreaChart key={range} data={series} height={210} />
        ) : (
          <div className="grid h-[210px] place-items-center">
            <div className="flex items-center gap-6">
              <ScenePrice className="w-[180px]" />
              <div className="max-w-[300px]">
                <h3 className="font-display text-[17px] font-bold">{settings?.keys.bricklink.set ? 'No prices in this range yet' : 'Connect BrickLink to see the value'}</h3>
                <p className="mt-1 text-[13px] text-fg-3">{settings?.keys.bricklink.set ? 'Prices update once a day while BrickForge is open. Each update adds a point here.' : 'Market prices come from BrickLink sales. Add your free API keys and prices update daily.'}</p>
                {!settings?.keys.bricklink.set && <Button className="mt-3" size="sm" variant="primary" onClick={() => navigate('/settings#connections')}>Add BrickLink keys</Button>}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function Movers() {
  const { data: movers } = useMovers(90)
  const openSheet = useUi((s) => s.openSheet)
  return (
    <section className="panel p-5">
      <SectionTitle title="Top movers" sub="Biggest price changes, last 90 days" />
      {!movers?.length ? (
        <p className="py-4 text-[13px] text-fg-4">Prices need at least two updates before anything can move.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {movers.slice(0, 5).map((m, i) => (
            <motion.li key={`${m.entity_type}:${m.entity_id}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.05 }}>
              <button type="button" onClick={() => openSheet(m.entity_type, m.entity_id)} className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left hover:bg-hover">
                <ItemImage src={m.image_url} alt="" className="size-10 shrink-0 rounded-[10px]" pad="p-1" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{m.name ?? m.entity_id}</div>
                  <div className="truncate font-mono text-[11px] text-fg-4">{m.entity_id} · {formatMoney(m.previous)} → {formatMoney(m.latest)}</div>
                </div>
                <Delta value={m.delta} pct={m.pct} showPct={false} className="hidden 2xl:inline-flex" />
                <span className={cn('tnum font-mono text-[12.5px] font-semibold', m.pct >= 0 ? 'text-up' : 'text-down')}>{m.pct >= 0 ? '+' : '−'}{Math.abs(m.pct).toFixed(1)}%</span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Alerts() {
  const navigate = useNavigate()
  const { data: alerts } = useAlerts()
  const openSheet = useUi((s) => s.openSheet)
  const fired = (alerts ?? []).filter((a) => a.triggered_at)
  const watching = (alerts ?? []).filter((a) => !a.triggered_at)
  return (
    <section className="panel p-5">
      <SectionTitle title="Price alerts" sub={alerts?.length ? (fired.length ? `${fired.length} hit their target · watching ${watching.length}` : `Watching ${plural(watching.length, 'price')}`) : undefined}
        action={alerts?.length ? <Button size="sm" variant="ghost" onClick={() => navigate('/value#alerts')}>All</Button> : undefined} />
      {!alerts?.length ? (
        <div className="flex items-center gap-4 py-1">
          <SceneQuiet className="w-[110px] shrink-0" />
          <p className="text-[12.5px] text-fg-3">No alerts yet. Open any item and set a price to watch for, up or down.</p>
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {[...fired, ...watching].slice(0, 4).map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => openSheet(a.entity_type, a.entity_id)} className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left hover:bg-hover">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-[10px]', a.triggered_at ? 'bg-accent-soft text-accent-text' : 'bg-panel-3 text-fg-3')}>
                  {a.triggered_at ? <BellRing className="size-4" /> : <Bell className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{a.name ?? a.entity_id}</div>
                  <div className="font-mono text-[11px] text-fg-4">{a.direction === 'below' ? '≤' : '≥'} {formatMoney(a.target_price)} · now {formatMoney(a.current_price)}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Recent() {
  const navigate = useNavigate()
  const openSheet = useUi((s) => s.openSheet)
  const { data: sets } = useSets({ scope: 'owned', sort: 'added' })
  const { data: figs } = useFigs({ scope: 'owned', sort: 'added' })
  const recent = useMemo(() => [
    ...(sets ?? []).map((s) => ({ kind: 'set' as const, num: s.set_number, label: s.set_number, name: s.name, img: s.image_url, at: s.created_at, price: s.market_price })),
    ...(figs ?? []).map((f) => ({ kind: 'minifig' as const, num: f.fig_number, label: f.bricklink_id ?? f.fig_number, name: f.name, img: f.image_url, at: f.created_at, price: f.market_price })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5), [sets, figs])
  if (!recent.length) return null
  return (
    <section className="panel p-5">
      <SectionTitle title="Recently added" action={<Button size="sm" variant="ghost" icon={<ArrowRight className="size-3.5" />} onClick={() => navigate('/collection')}>Collection</Button>} />
      <div className="grid grid-cols-5 gap-3">
        {recent.map((r, i) => (
          <motion.button key={`${r.kind}:${r.num}`} type="button" onClick={() => openSheet(r.kind, r.num)}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.06, type: 'spring', stiffness: 500, damping: 28 }}
            className="group flex min-w-0 flex-col rounded-[14px] p-1.5 text-left transition-transform duration-200 hover:-translate-y-1 hover:bg-hover">
            <ItemImage src={r.img} alt="" className="aspect-[4/3] w-full rounded-[11px]" pad="p-2" />
            <span className="mt-2 truncate font-mono text-[11px] text-accent-text">{r.label}</span>
            <span className="truncate text-[12.5px] font-medium">{r.name}</span>
            <span className="tnum font-mono text-[11.5px] text-fg-3">{formatMoney(r.price)}</span>
          </motion.button>
        ))}
      </div>
    </section>
  )
}

function ScanStatus({ onOpen }: { onOpen: () => void }) {
  const { data: jobs } = useScanJobs()
  const waiting = jobs?.filter((j) => j.status === 'done').length ?? 0
  const working = jobs?.filter((j) => j.status === 'queued' || j.status === 'running').length ?? 0
  if (!waiting && !working) return null
  return (
    <button type="button" onClick={onOpen} className="panel flex items-center gap-4 p-5 text-left transition-colors hover:border-line-strong">
      <span className="grid size-11 place-items-center rounded-[13px] bg-accent-soft text-accent-text"><ScanLine className="size-5" /></span>
      <div className="flex-1">
        <div className="font-display text-[15px] font-bold">{waiting ? `${plural(waiting, 'scan')} ready for your pick` : `Identifying ${plural(working, 'photo')}`}</div>
        <div className="text-[12.5px] text-fg-3">{working ? `${working} still working in the background` : 'Open Scan to add them'}</div>
      </div>
      <ArrowRight className="size-4 text-fg-3" />
    </button>
  )
}

function Setup() {
  const navigate = useNavigate()
  const { data: s } = useSettings()
  const { data: info } = useAppInfo()
  if (!s || info?.demo) return null
  const ai = s.aiProvider === 'claude-code' || (s.aiProvider === 'anthropic' ? s.keys.anthropic.set : s.keys.openai.set)
  const steps = [
    { done: s.keys.rebrickable.set, label: 'Catalog (Rebrickable)', body: 'Search and add sets' },
    { done: s.keys.bricklink.set, label: 'Prices (BrickLink)', body: 'Value, history, alerts' },
    { done: ai, label: 'AI (optional)', body: 'Tougher scans and listings' },
  ]
  if (steps.every((x) => x.done)) return null
  return (
    <section className="panel p-5">
      <SectionTitle title="Finish setting up" sub={`${steps.filter((x) => x.done).length} of 3 connected`} />
      <ul className="flex flex-col gap-1">
        {steps.map((st) => (
          <li key={st.label}>
            <button type="button" disabled={st.done} onClick={() => navigate('/settings#connections')}
              className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left hover:bg-hover disabled:hover:bg-transparent">
              {st.done ? <CheckCircle2 className="size-[18px] text-up" /> : <CircleDashed className="size-[18px] text-fg-4" />}
              <div className="flex-1">
                <div className={cn('text-[13px] font-medium', st.done && 'text-fg-3 line-through decoration-fg-4')}>{st.label}</div>
                <div className="text-[11.5px] text-fg-4">{st.body}</div>
              </div>
              {!st.done && <ArrowRight className="size-4 text-fg-3" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function FirstRun() {
  const navigate = useNavigate()
  const openAdd = useUi((s) => s.openAdd)
  return (
    <div className="panel !rounded-[24px] px-8 py-4">
      <Empty scene={<SceneBuild />} title="Your vault is empty"
        actions={
          <>
            <Button variant="primary" size="lg" icon={<Plus className="size-4" />} onClick={() => openAdd()}>Add a set</Button>
            <Button size="lg" icon={<Camera className="size-4" />} onClick={() => navigate('/scan')}>Scan photos</Button>
            <Button size="lg" icon={<FileUp className="size-4" />} onClick={() => navigate('/collection?import=1')}>Import a file</Button>
          </>
        }>
        Add sets by name or number, drop photos of your shelf, or bring in a list from Brickset, Rebrickable, or BrickLink.
      </Empty>
    </div>
  )
}
