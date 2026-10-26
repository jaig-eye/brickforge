import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Check, Sparkles, ImagePlus, Trash2, History, RotateCcw, Hash } from 'lucide-react'
import { api, fileToBase64 } from '@/lib/api'
import { useSets, useListings, useSettings, keys } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { formatMoney, formatDate, formatNumber } from '@/lib/formatters'
import { cn } from '@/lib/cn'
import { SOFT } from '@/lib/motion'
import { AI_PROVIDERS } from '@/lib/ai-models'
import type { ListingPrefs, PriceCondition, SetIdentifyResult, ListingResult } from '@/lib/types'
import { Page, Rise } from '@/components/shell/Page'
import { Button, IconButton } from '@/components/ui/Button'
import { Input, SearchInput, Textarea } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { Switch } from '@/components/ui/Menu'
import { Chip, ItemImage, Spinner, Confidence } from '@/components/ui/Bits'
import { SceneKey } from '@/components/brick/Scenes'

type Source = 'collection' | 'number' | 'photo'

const DEFAULT_PREFS: ListingPrefs = {
  completeness: 'complete', includes_instructions: true, includes_figures: true, includes_box: false,
  smoke_free_home: false, clean_set: false, seller_notes: null,
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1600) } catch { toast.error(new Error('The clipboard is unavailable.')) }
  }
  return { copied, copy }
}

export default function Sell() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const { data: settings } = useSettings()
  const [source, setSource] = useState<Source>('collection')
  const [setNumber, setSetNumber] = useState<string | null>(params.get('set'))
  const [prefs, setPrefs] = useState<ListingPrefs>(DEFAULT_PREFS)
  const [priceCond, setPriceCond] = useState<PriceCondition>('used')
  const [result, setResult] = useState<ListingResult | null>(null)
  const [busy, setBusy] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const p = params.get('set'); if (p) setSetNumber(p) }, [params])

  const hasAi = !!settings && (settings.aiProvider === 'claude-code' || settings.keys[settings.aiProvider === 'anthropic' ? 'anthropic' : 'openai'].set)
  const providerLabel = AI_PROVIDERS.find((p) => p.id === settings?.aiProvider)?.label

  const generate = async () => {
    if (!setNumber) return
    setBusy(true)
    try {
      const r = await api.sell.generate(setNumber, prefs)
      setResult(r)
      void qc.invalidateQueries({ queryKey: keys.listings })
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    } catch (err) { toast.error(err, "Couldn't write the listing") } finally { setBusy(false) }
  }

  return (
    <Page title="Sell" sub="An eBay-ready title and description for any set, plus what it sells for on BrickLink.">
      {!hasAi && settings ? (
        <Rise className="mb-5 flex items-center gap-4 rounded-[18px] border border-[color-mix(in_srgb,var(--warn)_40%,var(--line))] bg-warn-soft px-5 py-3.5">
          <SceneKey className="w-[90px] shrink-0" />
          <p className="flex-1 text-[13px] text-fg-2">Writing listings needs an AI provider. Your Claude subscription through Claude Code works, or an Anthropic or OpenAI key.</p>
          <Button variant="primary" size="sm" onClick={() => navigate('/settings#connections')}>Set up AI</Button>
        </Rise>
      ) : null}
      <div className="grid grid-cols-12 items-start gap-5">
        <Rise className="col-span-12 xl:col-span-5">
          <Step n={1} title="Pick the set">
            <Segmented label="Source" value={source} onChange={setSource}
              options={[{ value: 'collection', label: 'From your collection' }, { value: 'number', label: 'By number' }, { value: 'photo', label: 'From a photo' }]} />
            <div className="mt-4">
              {source === 'collection' && <FromCollection selected={setNumber} onPick={setSetNumber} />}
              {source === 'number' && <ByNumber onPick={setSetNumber} />}
              {source === 'photo' && <FromPhoto onPick={setSetNumber} disabled={!hasAi} />}
            </div>
          </Step>
        </Rise>
        <Rise className="col-span-12 flex flex-col gap-5 xl:col-span-7">
          <Picked setNumber={setNumber} onClear={() => { setSetNumber(null); setResult(null) }} />
          <Step n={2} title="Describe your copy">
            <div className="flex flex-col gap-4">
              <Segmented label="Completeness" value={prefs.completeness} onChange={(c) => setPrefs({ ...prefs, completeness: c })}
                options={[{ value: 'complete', label: 'Complete' }, { value: 'partial', label: '99% complete' }, { value: 'incomplete', label: 'Incomplete' }]} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {([
                  ['includes_instructions', 'Instructions included'], ['includes_figures', 'Minifigures included'], ['includes_box', 'Original box included'],
                  ['smoke_free_home', 'Smoke-free home'], ['clean_set', 'Clean, well kept'],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-3 text-[13px] text-fg-2">
                    <Switch label={label} checked={prefs[k]} onCheckedChange={(v) => setPrefs({ ...prefs, [k]: v })} />{label}
                  </label>
                ))}
              </div>
              <Textarea value={prefs.seller_notes ?? ''} onChange={(e) => setPrefs({ ...prefs, seller_notes: e.target.value || null })}
                placeholder="Anything a buyer should know, in your words (missing pieces, sticker wear, display only…)" />
            </div>
          </Step>
          <Step n={3} title="Price it" aside={<Segmented size="sm" label="Price condition" value={priceCond} onChange={setPriceCond} options={[{ value: 'used', label: 'Used' }, { value: 'new', label: 'Sealed' }]} />}>
            <PriceGuide setNumber={setNumber} condition={priceCond} />
          </Step>
          <div className="flex items-center gap-3">
            <Button variant="primary" size="lg" icon={<Sparkles className="size-4" />} disabled={!setNumber || !hasAi} loading={busy} onClick={generate}>
              {result ? 'Write it again' : 'Write the listing'}
            </Button>
            {busy && <span className="text-[12.5px] text-fg-3">{providerLabel} is writing{settings?.aiProvider === 'claude-code' ? '. Claude Code takes a little longer' : ''}…</span>}
          </div>
        </Rise>
      </div>
      <div ref={resultRef} className="scroll-mt-4">
        <AnimatePresence>{result && <Result key={result.id} title={result.title} html={result.description} />}</AnimatePresence>
      </div>
      <Rise className="mt-8"><HistoryList onOpen={(r) => setResult(r)} /></Rise>
    </Page>
  )
}

function Step({ n, title, children, aside }: { n: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 font-display text-[17px] font-bold">
          <span className="grid size-7 place-items-center rounded-[9px] bg-panel-3 font-display text-[14px] font-extrabold text-accent-text">{n}</span>{title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function FromCollection({ selected, onPick }: { selected: string | null; onPick: (n: string) => void }) {
  const [q, setQ] = useState('')
  const { data: sets } = useSets({ scope: 'owned', sort: 'name', dir: 'asc' })
  const list = useMemo(() => (sets ?? []).filter((s) => !q || `${s.name} ${s.set_number}`.toLowerCase().includes(q.toLowerCase())), [sets, q])
  return (
    <div>
      <SearchInput value={q} onChange={setQ} placeholder="Find a set you own" />
      <ul className="mt-3 flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
        {list.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.set_number)}
              className={cn('flex w-full items-center gap-3 rounded-[12px] px-2 py-1.5 text-left', selected === s.set_number ? 'bg-accent-soft' : 'hover:bg-hover')}>
              <ItemImage src={s.image_url} alt="" className="size-11 shrink-0 rounded-[10px]" pad="p-1" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{s.name}</div>
                <div className="font-mono text-[11px] text-fg-4">{s.set_number} · {formatMoney(s.market_price)}</div>
              </div>
              {selected === s.set_number && <Check className="size-4 text-accent-text" />}
            </button>
          </li>
        ))}
        {!list.length && <li className="py-6 text-center text-[12.5px] text-fg-4">{sets?.length ? 'No sets match.' : 'No sets in your collection yet. Use "By number" instead.'}</li>}
      </ul>
    </div>
  )
}

function ByNumber({ onPick }: { onPick: (n: string) => void }) {
  const [v, setV] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) onPick(v.trim().includes('-') ? v.trim() : `${v.trim()}-1`) }} className="flex gap-2">
      <div className="relative flex-1">
        <Hash className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Set number, e.g. 75192" className="pl-9 font-mono" autoFocus />
      </div>
      <Button type="submit" variant="primary" disabled={!v.trim()}>Use this set</Button>
    </form>
  )
}

function FromPhoto({ onPick, disabled }: { onPick: (n: string) => void; disabled: boolean }) {
  const [hint, setHint] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [res, setRes] = useState<SetIdentifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const drop = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }, multiple: false, disabled: disabled || busy,
    onDrop: async (files) => {
      if (!files[0]) return
      setPreview(URL.createObjectURL(files[0])); setRes(null); setBusy(true)
      try {
        const r = await api.sell.identify(await fileToBase64(files[0]), hint)
        setRes(r)
        if (r.rb && r.confidence >= 0.8) onPick(r.rb.set_num)
      } catch (err) { toast.error(err, "Couldn't identify the photo") } finally { setBusy(false) }
    },
  })
  const options = res ? [
    ...(res.rb ? [{ num: res.rb.set_num, name: res.rb.name, img: res.rb.set_img_url, conf: res.confidence }] : []),
    ...res.candidates.filter((c) => c.set_num !== res.rb?.set_num).slice(0, 4).map((c) => ({ num: c.set_num, name: c.name, img: c.set_img_url, conf: c.source === 'visual' ? Math.min(c.score, 0.45) : 0.2 })),
  ] : []
  return (
    <div className="flex flex-col gap-3">
      <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Optional hint: what is it? e.g. “Mos Espa podrace diorama”" disabled={disabled} />
      <div {...drop.getRootProps()} className={cn('relative grid h-[180px] cursor-pointer place-items-center overflow-hidden rounded-[16px] border-2 border-dashed', drop.isDragActive ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-fg-4', disabled && 'cursor-not-allowed opacity-50')}>
        <input {...drop.getInputProps()} />
        {preview ? <img src={preview} alt="" className="size-full object-cover" /> : (
          <div className="flex flex-col items-center gap-2 text-center text-[12.5px] text-fg-3"><ImagePlus className="size-6" />{disabled ? 'Needs an AI provider' : 'Drop a photo of the set or its box'}</div>
        )}
        {busy && <div className="absolute inset-0 grid place-items-center bg-black/35"><Spinner className="size-7" /></div>}
      </div>
      {res?.error && !options.length && <p className="text-[12.5px] text-fg-3">{res.error}</p>}
      {options.length > 0 && (
        <ul className="flex flex-col gap-1">
          {options.map((o) => (
            <li key={o.num}>
              <button type="button" onClick={() => onPick(o.num)} className="flex w-full items-center gap-3 rounded-[12px] px-2 py-1.5 text-left hover:bg-hover">
                <ItemImage src={o.img} alt="" className="size-11 rounded-[10px]" pad="p-1" />
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{o.name}</div><div className="font-mono text-[11px] text-fg-4">{o.num}</div></div>
                <Confidence value={o.conf} size={32} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Picked({ setNumber, onClear }: { setNumber: string | null; onClear: () => void }) {
  const detail = useQuery({ queryKey: ['catalog', 'detail', setNumber], queryFn: () => api.catalog.setDetail(setNumber!), enabled: !!setNumber, staleTime: Infinity, retry: false })
  return (
    <AnimatePresence mode="wait">
      {setNumber ? (
        <motion.section key={setNumber} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SOFT}
          className="panel flex items-center gap-5 p-4">
          <ItemImage src={detail.data?.set.set_img_url} alt="" className="size-[96px] shrink-0 rounded-[14px]" pad="p-2" />
          <div className="min-w-0 flex-1">
            <span className="font-mono text-[12px] text-accent-text">{setNumber}</span>
            <h3 className="truncate font-display text-[19px] font-bold">{detail.data?.set.name ?? (detail.isLoading ? 'Looking it up…' : 'Set')}</h3>
            {detail.data && (
              <p className="text-[12.5px] text-fg-3">
                {[detail.data.theme, detail.data.set.year, `${formatNumber(detail.data.set.num_parts)} pieces`, `${detail.data.minifigs.reduce((n, f) => n + f.quantity, 0)} minifigures`].filter(Boolean).join(' · ')}
              </p>
            )}
            {detail.error && <p className="text-[12.5px] text-down">{(detail.error as Error).message}</p>}
          </div>
          <Button size="sm" variant="ghost" onClick={onClear}>Change</Button>
        </motion.section>
      ) : (
        <motion.section key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid h-[128px] place-items-center rounded-[18px] border-2 border-dashed border-line text-[13px] text-fg-4">
          Pick a set to sell
        </motion.section>
      )}
    </AnimatePresence>
  )
}

function PriceGuide({ setNumber, condition }: { setNumber: string | null; condition: PriceCondition }) {
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const q = useQuery({ queryKey: ['sell', 'price', setNumber, condition], queryFn: () => api.sell.price(setNumber!, condition), enabled: !!setNumber && !!settings?.keys.bricklink.set, retry: false, staleTime: 3_600_000 })
  if (!settings?.keys.bricklink.set) return <p className="text-[13px] text-fg-3">Add your BrickLink keys to see recent sold prices here. <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => navigate('/settings#connections')}>Settings</button></p>
  if (!setNumber) return <p className="text-[13px] text-fg-4">Pick a set to see what it sells for.</p>
  if (q.isLoading) return <div className="flex items-center gap-2 text-[13px] text-fg-3"><Spinner />Checking BrickLink…</div>
  if (q.error) return <p className="text-[13px] text-down">{(q.error as Error).message}</p>
  if (!q.data) return <p className="text-[13px] text-fg-3">BrickLink has no {condition} sales or listings for this set right now.</p>
  const d = q.data
  return (
    <div className="flex flex-wrap items-end gap-8">
      <div>
        <div className="eyebrow">{d.source === 'sold' ? 'Sold average, last 6 months' : 'Cheapest current listing'}</div>
        <div className="tnum mt-1 font-display text-[34px] font-extrabold leading-none tracking-[-0.03em]">{formatMoney(d.avg)}</div>
      </div>
      <div className="text-[12.5px] text-fg-3">
        <div>Range <span className="tnum font-mono text-fg-2">{formatMoney(d.min)} – {formatMoney(d.max)}</span></div>
        {d.samples != null && <div>{d.source === 'sold' ? `${d.samples} sold` : `${d.samples} for sale`} · US</div>}
      </div>
      <Chip tone="accent" className="ml-auto">BrickLink</Chip>
    </div>
  )
}

function Result({ title, html }: { title: string; html: string }) {
  const { copied, copy } = useCopy()
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#e9ecf2;font-family:Arial,sans-serif}</style></head><body>${html}</body></html>`
  return (
    <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SOFT} className="panel mt-6 overflow-hidden !rounded-[22px]">
      <div className="border-b border-line p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="eyebrow">eBay title · {title.length}/80</span>
          <Button size="sm" variant={copied === 'title' ? 'secondary' : 'primary'} icon={copied === 'title' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={() => void copy('title', title)}>
            {copied === 'title' ? 'Copied' : 'Copy title'}
          </Button>
        </div>
        <p className="selectable font-display text-[20px] font-bold leading-snug">{title}</p>
      </div>
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="eyebrow">Description preview</span>
          <Button size="sm" variant={copied === 'html' ? 'secondary' : 'primary'} icon={copied === 'html' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={() => void copy('html', html)}>
            {copied === 'html' ? 'Copied' : 'Copy HTML'}
          </Button>
        </div>
        {/* No scripts can run in here: the frame is sandboxed and the HTML is sanitized */}
        <iframe title="Listing preview" sandbox="" srcDoc={doc} className="h-[560px] w-full rounded-[14px] border border-line bg-white" />
        <p className="mt-2 text-[11.5px] text-fg-4">In eBay's listing editor, switch the description to HTML and paste.</p>
      </div>
    </motion.section>
  )
}

function HistoryList({ onOpen }: { onOpen: (r: ListingResult) => void }) {
  const qc = useQueryClient()
  const { data: listings } = useListings()
  const [q, setQ] = useState('')
  const list = (listings ?? []).filter((l) => !q || `${l.set_name} ${l.set_number} ${l.title}`.toLowerCase().includes(q.toLowerCase()))
  if (!listings?.length) return null
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[17px] font-bold"><History className="size-4 text-fg-3" />Past listings <span className="font-sans text-[13px] font-normal text-fg-4">{listings.length}</span></h2>
        <SearchInput value={q} onChange={setQ} placeholder="Search past listings" className="w-[260px]" />
      </div>
      <ul className="-mx-2 flex flex-col">
        {list.slice(0, 50).map((l) => (
          <li key={l.id} className="group flex items-center gap-3 rounded-[12px] px-2 py-2 hover:bg-hover">
            <span className="w-[86px] shrink-0 font-mono text-[11.5px] text-accent-text">{l.set_number}</span>
            <button type="button" className="min-w-0 flex-1 truncate text-left text-[13px]" onClick={() => onOpen({ id: l.id, title: l.title, description: l.description })}>{l.title}</button>
            <span className="shrink-0 text-[11.5px] text-fg-4">{formatDate(l.created_at)}</span>
            <IconButton label="Open" size="sm" onClick={() => onOpen({ id: l.id, title: l.title, description: l.description })}><RotateCcw className="size-3.5" /></IconButton>
            <IconButton label="Delete" size="sm" tone="danger" onClick={async () => { await api.sell.remove(l.id); await qc.invalidateQueries({ queryKey: keys.listings }) }}><Trash2 className="size-3.5" /></IconButton>
          </li>
        ))}
        {!list.length && <li className="py-4 text-center text-[12.5px] text-fg-4">No past listings match.</li>}
      </ul>
    </section>
  )
}

