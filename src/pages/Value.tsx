import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { RefreshCw, X, Bell, BellRing, Trash2, RotateCcw, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { useSummary, usePortfolio, useMovers, useAlerts, useSets, useFigs, useRefreshStatus, useSettings, useAppInfo, keys } from '@/lib/queries'
import { useUi } from '@/lib/ui-store'
import { toast } from '@/lib/toast'
import { formatMoney, formatAgo, formatDate, formatPct } from '@/lib/formatters'
import { cn } from '@/lib/cn'
import { Page, Rise } from '@/components/shell/Page'
import { Button, IconButton } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Delta, Empty, ItemImage, Ring, SectionTitle, Ticker } from '@/components/ui/Bits'
import { AreaChart } from '@/components/charts/AreaChart'
import { ScenePrice, SceneQuiet } from '@/components/brick/Scenes'

const RANGES = { '30d': 30, '90d': 90, '1y': 365, All: 3650 } as const
type Range = keyof typeof RANGES
type Series = 'total' | 'set_value' | 'fig_value'

export default function Value() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: s } = useSummary()
  const { data: settings } = useSettings()
  const { data: refresh } = useRefreshStatus()
  const { data: info } = useAppInfo()
  useEffect(() => {
    if (location.hash === '#alerts') setTimeout(() => document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }, [location.hash])

  const start = async () => { try { await api.prices.refresh() } catch (err) { toast.error(err, "Couldn't start the update") } }
  const noKeys = settings && !settings.keys.bricklink.set

  return (
    <Page title="Value" sub={s?.last_priced_at ? `Market prices from BrickLink · updated ${formatAgo(s.last_priced_at)}${settings?.autoRefreshPrices ? ' · updates daily' : ''}` : 'Market prices from BrickLink'}
      actions={info?.demo ? undefined : noKeys ? <Button variant="primary" onClick={() => navigate('/settings#connections')}>Add BrickLink keys</Button> : refresh?.running ? (
        <>
          <span className="tnum flex items-center gap-2 text-[12.5px] text-fg-3"><Ring value={refresh.total ? refresh.done / refresh.total : 0} size={18} />{refresh.done} of {refresh.total}</span>
          <Button variant="ghost" icon={<X className="size-4" />} onClick={() => api.prices.cancel()}>Stop</Button>
        </>
      ) : <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={start}>Update prices now</Button>}>
      {refresh && (refresh.running || refresh.failed > 0) && <Rise className="mb-5"><RefreshPanel /></Rise>}
      {s && s.priced_items === 0 ? (
        <div className="panel !rounded-[24px]">
          <Empty scene={<ScenePrice />} title={noKeys ? "Connect BrickLink to see what it's worth" : 'No prices yet'}
            actions={noKeys ? <Button variant="primary" onClick={() => navigate('/settings#connections')}>Add BrickLink keys</Button> : <Button variant="primary" onClick={start}>Update prices now</Button>}>
            {noKeys ? 'Prices come from BrickLink sales in the last six months. The keys are free with a BrickLink account.' : 'Fetch prices for everything you own and want. After that, they update once a day while BrickForge is open.'}
          </Empty>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <Rise><ValueChart /></Rise>
          <div className="grid grid-cols-12 items-start gap-5">
            <Rise className="col-span-12 xl:col-span-7"><MoversPanel /></Rise>
            <Rise className="col-span-12 xl:col-span-5"><ThemeBreakdown /></Rise>
          </div>
          <Rise><MostValuable /></Rise>
          <Rise><AlertsPanel /></Rise>
        </div>
      )}
    </Page>
  )
}

function RefreshPanel() {
  const { data: r } = useRefreshStatus()
  const [open, setOpen] = useState(false)
  if (!r) return null
  const pct = r.total ? r.done / r.total : 0
  return (
    <section className="panel overflow-hidden p-0">
      <div className="h-1 bg-panel-3"><motion.div className="h-full bg-accent" animate={{ width: `${(r.running ? pct : 1) * 100}%` }} transition={{ ease: 'easeOut' }} /></div>
      <div className="flex items-center gap-4 px-5 py-3">
        {r.running ? <RefreshCw className="size-4 animate-spin text-accent-text" /> : <AlertTriangle className="size-4 text-warn" />}
        <div className="min-w-0 flex-1 text-[13px]">
          {r.running
            ? <>Updating prices from BrickLink: <span className="tnum">{r.done} of {r.total}</span>{r.current && <span className="text-fg-3"> · {r.current}</span>}</>
            : <>Last update: {r.refreshed} priced, {r.failed} without a price{r.finishedAt ? ` · ${formatAgo(r.finishedAt)}` : ''}</>}
        </div>
        {r.errors.length > 0 && <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Hide details' : 'Details'}</Button>}
      </div>
      {open && (
        <ul className="max-h-[200px] overflow-y-auto border-t border-line px-5 py-2 text-[12px]">
          {r.errors.map((e, i) => <li key={i} className="flex gap-3 py-1"><span className="w-[110px] shrink-0 font-mono text-fg-2">{e.id}</span><span className="text-fg-3">{e.message}</span></li>)}
        </ul>
      )}
    </section>
  )
}

function ValueChart() {
  const [range, setRange] = useState<Range>('90d')
  const [series, setSeries] = useState<Series>('total')
  const { data: s } = useSummary()
  const { data: history } = usePortfolio(RANGES[range])
  const data = useMemo(() => (history ?? []).map((p) => ({ day: p.day, value: p[series] })), [history, series])
  const first = data[0]?.value
  const last = data[data.length - 1]?.value
  const change = first != null && last != null && data.length > 1 ? last - first : null
  if (!s) return <div className="skeleton h-[420px] !rounded-[22px]" />
  const shown = series === 'total' ? s.total_value : series === 'set_value' ? s.set_value : s.fig_value

  return (
    <section className="panel !rounded-[22px] p-6 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">{series === 'total' ? 'Everything you own' : series === 'set_value' ? 'Sets' : 'Minifigures'}</div>
          <div className="mt-2 font-display text-[44px] font-extrabold leading-none tracking-[-0.04em]"><Ticker value={shown} format={(n) => formatMoney(n)} /></div>
          {change != null && (
            <div className="mt-2 flex items-center gap-2 text-[12.5px] text-fg-3">
              <Delta value={change} pct={first ? (change / first) * 100 : null} size="md" />
              <span>over {range === 'All' ? 'all recorded history' : `the last ${range === '1y' ? 'year' : range.replace('d', ' days')}`}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Segmented size="sm" label="Range" value={range} onChange={setRange} options={(Object.keys(RANGES) as Range[]).map((r) => ({ value: r, label: r }))} />
          <Segmented size="sm" label="Series" value={series} onChange={setSeries} options={[{ value: 'total', label: 'Total' }, { value: 'set_value', label: 'Sets' }, { value: 'fig_value', label: 'Minifigs' }]} />
        </div>
      </div>
      <div className="mt-5">
        {data.length ? <AreaChart key={`${range}-${series}`} data={data} height={240} /> : <div className="grid h-[240px] place-items-center text-[13px] text-fg-4">No price points in this range. Try a longer one.</div>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-4">
        {[
          ['Sets', formatMoney(s.set_value)],
          ['Minifigures', formatMoney(s.fig_value)],
          ['You paid', s.cost_basis ? formatMoney(s.cost_basis) : '—'],
          ['Gain on cost', s.gain != null ? `${s.gain >= 0 ? '+' : '−'}${formatMoney(Math.abs(s.gain))} (${formatPct(s.gain_pct)})` : '—'],
        ].map(([label, v]) => (
          <div key={label} className="bg-panel px-4 py-3">
            <div className="text-[11.5px] text-fg-3">{label}</div>
            <div className={cn('tnum mt-0.5 font-mono text-[15px] font-semibold', label === 'Gain on cost' && s.gain != null && (s.gain >= 0 ? 'text-up' : 'text-down'))}>{v}</div>
          </div>
        ))}
      </div>
      {s.gain != null && <p className="mt-2 text-[11.5px] text-fg-4">Gain counts only the {s.gain_items} items with both a purchase price and a market price.</p>}
    </section>
  )
}

function MoversPanel() {
  const [days, setDays] = useState<'30' | '90' | '365'>('90')
  const [dir, setDir] = useState<'up' | 'down'>('up')
  const { data: movers } = useMovers(Number(days))
  const openSheet = useUi((s) => s.openSheet)
  const list = (movers ?? []).filter((m) => (dir === 'up' ? m.delta > 0 : m.delta < 0)).sort((a, b) => (dir === 'up' ? b.pct - a.pct : a.pct - b.pct))
  return (
    <section className="panel p-5">
      <SectionTitle title="Movers" action={
        <div className="flex gap-2">
          <Segmented size="sm" label="Direction" value={dir} onChange={setDir} options={[{ value: 'up', label: 'Gainers' }, { value: 'down', label: 'Losers' }]} />
          <Segmented size="sm" label="Window" value={days} onChange={setDays} options={[{ value: '30', label: '30d' }, { value: '90', label: '90d' }, { value: '365', label: '1y' }]} />
        </div>
      } />
      {!list.length ? <p className="py-6 text-center text-[13px] text-fg-4">Nothing {dir === 'up' ? 'rose' : 'fell'} in this window.</p> : (
        <ul className="-mx-2">
          {list.slice(0, 8).map((m) => (
            <li key={`${m.entity_type}:${m.entity_id}`}>
              <button type="button" onClick={() => openSheet(m.entity_type, m.entity_id)} className="grid w-full grid-cols-[44px_1fr_auto_auto] items-center gap-3 rounded-[12px] px-2 py-2 text-left hover:bg-hover">
                <ItemImage src={m.image_url} alt="" className="size-11 rounded-[10px]" pad="p-1" />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{m.name ?? m.entity_id}</div>
                  <div className="font-mono text-[11px] text-fg-4">{m.entity_id} · {m.condition} · since {formatDate(m.since)}</div>
                </div>
                <span className="tnum font-mono text-[12px] text-fg-3">{formatMoney(m.previous)} → {formatMoney(m.latest)}</span>
                <Delta value={m.delta} pct={m.pct} className="w-[150px] justify-end" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const BAR_COLORS = ['#FFC929', '#2F7FEA', '#E5373C', '#22B36B', '#FF8A3D', '#A06CF0', '#8C93A8']

function ThemeBreakdown() {
  const { data: sets } = useSets({ scope: 'owned' })
  const { data: figs } = useFigs({ scope: 'owned' })
  const rows = useMemo(() => {
    const totals = new Map<string, number>()
    for (const i of [...(sets ?? []), ...(figs ?? [])]) {
      if (i.market_price == null) continue
      const key = i.theme ?? 'No theme yet'
      totals.set(key, (totals.get(key) ?? 0) + i.market_price * i.quantity)
    }
    const all = [...totals.entries()].sort((a, b) => b[1] - a[1])
    const top = all.slice(0, 6)
    const rest = all.slice(6).reduce((n, [, v]) => n + v, 0)
    if (rest > 0) top.push(['Everything else', rest])
    const sum = top.reduce((n, [, v]) => n + v, 0) || 1
    return top.map(([theme, v], i) => ({ theme, v, share: v / sum, color: BAR_COLORS[i % BAR_COLORS.length] }))
  }, [sets, figs])
  return (
    <section className="panel p-5">
      <SectionTitle title="By theme" sub="Share of your collection's value" />
      <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-panel-3">
        {rows.map((r, i) => (
          <motion.div key={r.theme} initial={{ width: 0 }} animate={{ width: `${r.share * 100}%` }} transition={{ delay: 0.2 + i * 0.06, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: r.color }} className="h-full first:rounded-l-full last:rounded-r-full" title={`${r.theme}: ${Math.round(r.share * 100)}%`} />
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.theme} className="flex items-center gap-3 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate">{r.theme}</span>
            <span className="tnum font-mono text-[12px] text-fg-3">{Math.round(r.share * 100)}%</span>
            <span className="tnum w-[96px] text-right font-mono text-[12.5px] font-semibold">{formatMoney(r.v)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MostValuable() {
  const { data: sets } = useSets({ scope: 'owned', sort: 'value' })
  const { data: figs } = useFigs({ scope: 'owned', sort: 'value' })
  const openSheet = useUi((s) => s.openSheet)
  const top = useMemo(() => [
    ...(sets ?? []).map((x) => ({ kind: 'set' as const, num: x.set_number, name: x.name, img: x.image_url, v: x.market_price != null ? x.market_price * x.quantity : null, paid: x.acquired_price, q: x.quantity })),
    ...(figs ?? []).map((x) => ({ kind: 'minifig' as const, num: x.fig_number, name: x.name, img: x.image_url, v: x.market_price != null ? x.market_price * x.quantity : null, paid: x.acquired_price, q: x.quantity })),
  ].filter((x) => x.v != null).sort((a, b) => b.v! - a.v!).slice(0, 6), [sets, figs])
  if (!top.length) return null
  return (
    <section className="panel p-5">
      <SectionTitle title="Most valuable" sub="Your six priciest pieces" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        {top.map((t, i) => (
          <button key={`${t.kind}:${t.num}`} type="button" onClick={() => openSheet(t.kind, t.num)} className="group relative flex flex-col rounded-[16px] p-2 text-left transition-transform hover:-translate-y-1 hover:bg-hover">
            <span className="absolute left-3 top-3 z-[1] grid size-6 place-items-center rounded-full bg-[rgb(12_14_22/0.8)] font-display text-[12px] font-extrabold text-white">{i + 1}</span>
            <ItemImage src={t.img} alt="" className="aspect-[4/3] w-full rounded-[12px]" />
            <span className="mt-2 truncate text-[12.5px] font-medium">{t.name}</span>
            <span className="tnum font-mono text-[13px] font-semibold">{formatMoney(t.v)}</span>
            {t.paid != null && <Delta value={(t.v! / t.q - t.paid) * t.q} pct={((t.v! / t.q - t.paid) / t.paid) * 100} showPct={false} />}
          </button>
        ))}
      </div>
    </section>
  )
}

function AlertsPanel() {
  const qc = useQueryClient()
  const { data: alerts } = useAlerts()
  const openSheet = useUi((s) => s.openSheet)
  const refresh = () => qc.invalidateQueries({ queryKey: keys.alerts })
  return (
    <section id="alerts" className="panel scroll-mt-4 p-5">
      <SectionTitle title="Price alerts" sub="Set alerts from any item's details. They're checked after every price update." />
      {!alerts?.length ? (
        <div className="flex items-center gap-5 py-2">
          <SceneQuiet className="w-[150px] shrink-0" />
          <p className="max-w-[460px] text-[13px] text-fg-3">No alerts yet. Open something on your wishlist and set a price you'd pay, or set a sell target on something you own. You'll get a desktop notification when it's reached.</p>
        </div>
      ) : (
        <ul className="-mx-2">
          {alerts.map((a) => {
            const gap = a.current_price != null ? a.current_price - a.target_price : null
            return (
              <li key={a.id} className="grid grid-cols-[36px_44px_1fr_auto_auto] items-center gap-3 rounded-[12px] px-2 py-2 hover:bg-hover">
                <span className={cn('grid size-9 place-items-center rounded-[10px]', a.triggered_at ? 'bg-accent-soft text-accent-text' : 'bg-panel-3 text-fg-3')}>{a.triggered_at ? <BellRing className="size-4" /> : <Bell className="size-4" />}</span>
                <button type="button" onClick={() => openSheet(a.entity_type, a.entity_id)}><ItemImage src={a.image_url} alt="" className="size-11 rounded-[10px]" pad="p-1" /></button>
                <button type="button" onClick={() => openSheet(a.entity_type, a.entity_id)} className="min-w-0 text-left">
                  <div className="truncate text-[13px] font-medium">{a.name ?? a.entity_id}</div>
                  <div className="text-[12px] text-fg-3">
                    {a.direction === 'below' ? 'When it drops to' : 'When it rises to'} <b className="font-mono text-fg-2">{formatMoney(a.target_price)}</b> ({a.condition})
                    {a.triggered_at ? <span className="text-accent-text"> · reached {formatDate(a.triggered_at)}</span> : gap != null ? <span> · {formatMoney(Math.abs(gap))} to go</span> : null}
                  </div>
                </button>
                <span className="tnum font-mono text-[12.5px] text-fg-2">now {formatMoney(a.current_price)}</span>
                <span className="flex">
                  {a.triggered_at && <IconButton label="Watch again" size="sm" onClick={async () => { await api.alerts.rearm(a.id); await refresh() }}><RotateCcw className="size-3.5" /></IconButton>}
                  <IconButton label="Delete alert" size="sm" tone="danger" onClick={async () => { await api.alerts.remove(a.id); await refresh() }}><Trash2 className="size-3.5" /></IconButton>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
