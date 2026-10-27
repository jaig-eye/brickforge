/**
 * Everything about one item, beside the page instead of replacing it: what
 * it's worth and how that moved, your copy's details (saved as you edit),
 * tags, a price alert, and where to find it online.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, RefreshCw, Trash2, Tag as TagIcon, Bell, BellRing, X, Heart, Package, Search, Plus } from 'lucide-react'
import { api, type DeletedRow } from '@/lib/api'
import { useUi } from '@/lib/ui-store'
import { useSets, useFigs, usePriceHistory, useAlerts, useTags, invalidateCollection, keys } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { formatMoney, formatAgo, formatDate, formatNumber } from '@/lib/formatters'
import { priceConditionForSet, priceConditionForFig } from '@/lib/conditions'
import type { CollectionSet, CollectionFig, PriceCondition, EntityKind } from '@/lib/types'
import { Sheet } from '../ui/Overlay'
import { Button, IconButton } from '../ui/Button'
import { Input, Select, Textarea, Field } from '../ui/Field'
import { Segmented } from '../ui/Segmented'
import { Chip, Delta, ItemImage, Spinner } from '../ui/Bits'
import { AreaChart } from '../charts/AreaChart'
import { cn } from '@/lib/cn'

type Item = CollectionSet | CollectionFig
const isSet = (i: Item): i is CollectionSet => 'set_number' in i

export function ItemSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.closeSheet)
  const { data: sets } = useSets({ scope: 'all' })
  const { data: figs } = useFigs({ scope: 'all' })
  const item: Item | undefined = sheet
    // A fig opened by its Rebrickable number stays open after it moves to its BrickLink id
    ? sheet.kind === 'set' ? sets?.find((s) => s.set_number === sheet.number) : figs?.find((f) => f.fig_number === sheet.number || f.bricklink_id === sheet.number || f.rebrickable_id === sheet.number)
    : undefined

  return (
    <Sheet open={!!sheet} onOpenChange={(o) => !o && close()} title={item?.name ?? 'Item'} width={520}>
      {sheet && !item && <div className="grid h-60 place-items-center"><Spinner className="size-6" /></div>}
      {item && <ItemBody key={`${sheet?.kind}:${sheet?.number}`} item={item} kind={sheet!.kind} />}
    </Sheet>
  )
}

function ItemBody({ item, kind }: { item: Item; kind: EntityKind }) {
  const navigate = useNavigate()
  const close = useUi((s) => s.closeSheet)
  const number = isSet(item) ? item.set_number : item.fig_number
  const matched: PriceCondition = isSet(item) ? priceConditionForSet(item.condition) : priceConditionForFig(item.condition)
  const [cond, setCond] = useState<PriceCondition>(matched)
  useEffect(() => setCond(matched), [matched])
  const { data: history } = usePriceHistory(kind, number)
  const [refreshing, setRefreshing] = useState(false)
  const series = useMemo(() => (history ?? []).filter((p) => p.condition === cond).map((p) => ({ day: p.day, value: p.avg_price })), [history, cond])
  const latest = series[series.length - 1]?.value ?? null
  const qty = Math.max(1, item.quantity)
  const value = item.market_price != null ? item.market_price * qty : null
  const gain = item.market_price != null && item.acquired_price != null ? (item.market_price - item.acquired_price) * qty : null
  const gainPct = gain != null && item.acquired_price ? (gain / (item.acquired_price * qty)) * 100 : null
  const blUrl = item.bricklink_url
  const rbFig = isSet(item) ? null : item.rebrickable_id ?? (item.fig_number.startsWith('fig-') ? item.fig_number : null)
  const rbUrl = isSet(item) ? item.rebrickable_url : rbFig ? `https://rebrickable.com/minifigs/${rbFig}/` : null

  const refresh = async () => {
    setRefreshing(true)
    try {
      const p = await api.prices.refreshItem(kind, number, cond)
      await invalidateCollection()
      if (p == null) toast.info('BrickLink has no sales or listings for this in that condition yet.')
    } catch (err) { toast.error(err, "Couldn't update the price") } finally { setRefreshing(false) }
  }

  const remove = async () => {
    try {
      const rows: DeletedRow[] = await api.collection.remove(kind, [item.id])
      close()
      await invalidateCollection()
      toast.success(`Removed ${item.name}`, { action: { label: 'Undo', run: async () => { await api.collection.restore(kind, rows); await invalidateCollection() } } })
    } catch (err) { toast.error(err) }
  }

  return (
    <div className="flex flex-col">
      <div className="relative px-6 pb-5 pt-6">
        <ItemImage src={item.image_url} alt={item.name} className="h-[220px] w-full rounded-[18px]" pad="p-6" />
        <div className="mt-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-accent-text">
              <span>{isSet(item) ? item.set_number : item.bricklink_id ?? item.fig_number}</span>
              {!item.is_owned && item.is_wanted ? <Chip tone="accent" icon={<Heart />}>Wishlist</Chip> : null}
              {item.quantity > 1 && <Chip>×{item.quantity}</Chip>}
            </div>
            <h2 className="mt-1 font-display text-[22px] font-bold leading-tight selectable">{item.name}</h2>
            <p className="mt-1 text-[12.5px] text-fg-3">
              {[item.theme, item.year, isSet(item) && item.piece_count ? `${formatNumber(item.piece_count)} pieces` : null].filter(Boolean).join(' · ') || 'Details are being filled in from the catalog'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Value ── */}
      <section className="mx-4 rounded-[18px] border border-line bg-panel-2/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Market value{qty > 1 ? ` · ${qty} copies` : ''}</div>
            <div className="mt-1 font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] tnum">{formatMoney(value)}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
              {gain != null && <Delta value={gain} pct={gainPct} />}
              <span>{item.market_at ? `${item.market_source === 'stock' ? 'Cheapest listing' : 'BrickLink sold average'} · ${formatAgo(item.market_at)}` : 'No price yet'}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Segmented size="sm" label="Price condition" value={cond} onChange={setCond} options={[{ value: 'new', label: 'New' }, { value: 'used', label: 'Used' }]} />
            <Button size="sm" variant="ghost" icon={<RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />} onClick={refresh} disabled={refreshing}>Update</Button>
          </div>
        </div>
        <div className="mt-3">
          {series.length ? (
            <AreaChart data={series} height={130} />
          ) : (
            <div className="grid h-[110px] place-items-center rounded-[12px] border border-dashed border-line text-[12.5px] text-fg-4">
              No {cond} price history yet{latest == null ? '. Use Update to fetch one.' : ''}
            </div>
          )}
        </div>
      </section>

      <YourCopy item={item} kind={kind} />
      <Tags kind={kind} number={number} tags={item.tags} />
      <AlertBox kind={kind} number={number} condition={matched} current={item.market_price} />
      {!isSet(item) && <FigLinks fig={item} />}

      <section className="flex flex-wrap items-center gap-2 px-6 pb-6 pt-2">
        {blUrl && <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => api.app.openExternal(blUrl)}>BrickLink</Button>}
        {rbUrl && <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => api.app.openExternal(rbUrl)}>Rebrickable</Button>}
        <div className="flex-1" />
        {isSet(item) && item.is_owned ? (
          <Button size="sm" icon={<Package className="size-3.5" />} onClick={() => { close(); navigate(`/sell?set=${encodeURIComponent(item.set_number)}`) }}>Sell this</Button>
        ) : null}
        <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={remove}>Remove</Button>
      </section>
    </div>
  )
}

/** Your copy: edits save themselves (debounced), with a quiet "Saved". */
function YourCopy({ item, kind }: { item: Item; kind: EntityKind }) {
  const qc = useQueryClient()
  const initial = useRef<string>('')
  const [draft, setDraft] = useState(() => ({
    condition: item.condition as string,
    quantity: String(item.quantity),
    paid: item.acquired_price != null ? String(item.acquired_price) : '',
    date: item.acquired_date ?? '',
    notes: item.notes ?? '',
    has_box: isSet(item) ? item.has_box : null,
    has_instructions: isSet(item) ? item.has_instructions : null,
    missing: isSet(item) ? item.missing_parts ?? '' : '',
  }))
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  // What's stored, as far as this sheet knows, and the save waiting out the debounce
  const stored = useRef(draft)
  const pending = useRef<(() => Promise<void>) | null>(null)
  if (!initial.current) initial.current = JSON.stringify(draft)

  // Closing the sheet mid-debounce saves at once instead of dropping the edit
  useEffect(() => () => { void pending.current?.() }, [])

  useEffect(() => {
    // Only real edits save: StrictMode re-runs effects, and opening must not write
    if (JSON.stringify(draft) === initial.current) return
    initial.current = JSON.stringify(draft)
    setState('saving')
    const save = async () => {
      pending.current = null
      // Only the fields edited here: anything else may have changed meanwhile
      // (another copy added while this sheet was closing) and must not be overwritten
      const was = stored.current
      const edited = (k: keyof typeof draft) => draft[k] !== was[k]
      const paid = draft.paid.trim() === '' ? null : Number(draft.paid)
      const patch: Record<string, unknown> = {}
      if (edited('condition')) patch.condition = draft.condition
      if (edited('quantity')) patch.quantity = Math.max(1, Math.floor(Number(draft.quantity) || 1))
      if (edited('paid')) patch.acquired_price = paid != null && Number.isFinite(paid) && paid >= 0 ? paid : null
      if (edited('date')) patch.acquired_date = draft.date || null
      if (edited('notes')) patch.notes = draft.notes.trim() || null
      if (kind === 'set') {
        if (edited('has_box')) patch.has_box = draft.has_box
        if (edited('has_instructions')) patch.has_instructions = draft.has_instructions
        if (edited('missing')) patch.missing_parts = draft.missing.trim() || null
      }
      stored.current = draft
      try {
        if (kind === 'set') await api.collection.updateSet(item.id, patch as never)
        else await api.collection.updateFig(item.id, patch as never)
        await qc.invalidateQueries({ queryKey: ['collection'] })
        void qc.invalidateQueries({ queryKey: ['prices'] })
        setState('saved')
      } catch (err) { stored.current = was; toast.error(err, "Couldn't save"); setState('idle') }
    }
    pending.current = save
    const t = setTimeout(() => void save(), 600)
    return () => clearTimeout(t)
  }, [draft])

  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }))
  const toggleOwned = async () => {
    try {
      if (kind === 'set') await api.collection.updateSet(item.id, item.is_owned ? { is_owned: 0, is_wanted: 1 } : { is_owned: 1, is_wanted: 0 })
      else await api.collection.updateFig(item.id, item.is_owned ? { is_owned: 0, is_wanted: 1 } : { is_owned: 1, is_wanted: 0 })
      await invalidateCollection()
      toast.success(item.is_owned ? 'Moved to your wishlist' : 'Moved into your collection')
    } catch (err) { toast.error(err) }
  }

  return (
    <section className="px-6 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-[15px] font-bold">{item.is_owned ? 'Your copy' : 'On your wishlist'}</h3>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-[11.5px] text-fg-4">{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}</span>
          <Button size="sm" variant="ghost" onClick={toggleOwned}>{item.is_owned ? 'Move to wishlist' : 'I own this now'}</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Condition">{(id) => (
          <Select id={id} value={draft.condition} onChange={(e) => set({ condition: e.target.value })}>
            {kind === 'set'
              ? <><option value="sealed">Sealed</option><option value="open_complete">Opened, complete</option><option value="open_incomplete">Opened, incomplete</option></>
              : <><option value="new">New</option><option value="used">Used</option><option value="cracked">Damaged</option></>}
          </Select>
        )}</Field>
        <Field label="Quantity">{(id) => <Input id={id} inputMode="numeric" value={draft.quantity} onChange={(e) => set({ quantity: e.target.value.replace(/\D/g, '').slice(0, 3) })} />}</Field>
        <Field label="Price paid (each)">{(id) => (
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-4">$</span>
            <Input id={id} inputMode="decimal" className="pl-6" placeholder="0.00" value={draft.paid} onChange={(e) => set({ paid: e.target.value.replace(/[^\d.]/g, '') })} />
          </div>
        )}</Field>
        <Field label="Acquired">{(id) => <Input id={id} type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />}</Field>
        {kind === 'set' && (
          <>
            <Field label="Box">{(id) => (
              <Select id={id} value={draft.has_box == null ? '' : String(draft.has_box)} onChange={(e) => set({ has_box: e.target.value === '' ? null : (Number(e.target.value) as 0 | 1) })}>
                <option value="">Not recorded</option><option value="1">Has the box</option><option value="0">No box</option>
              </Select>
            )}</Field>
            <Field label="Instructions">{(id) => (
              <Select id={id} value={draft.has_instructions == null ? '' : String(draft.has_instructions)} onChange={(e) => set({ has_instructions: e.target.value === '' ? null : (Number(e.target.value) as 0 | 1) })}>
                <option value="">Not recorded</option><option value="1">Has instructions</option><option value="0">No instructions</option>
              </Select>
            )}</Field>
            {draft.condition === 'open_incomplete' && (
              <Field label="Missing parts" className="col-span-2">{(id) => <Input id={id} placeholder="e.g. 2× 3001 red, one sticker" value={draft.missing} onChange={(e) => set({ missing: e.target.value })} />}</Field>
            )}
          </>
        )}
        <Field label="Notes" className="col-span-2">{(id) => <Textarea id={id} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Where you bought it, its story, its shelf…" />}</Field>
      </div>
    </section>
  )
}

function Tags({ kind, number, tags }: { kind: EntityKind; number: string; tags: string[] }) {
  const { data: all } = useTags()
  const [text, setText] = useState('')
  const add = async (name: string) => {
    const clean = name.trim()
    if (!clean || tags.includes(clean)) { setText(''); return }
    try { await api.tags.apply(kind, [number], [clean]); setText(''); await invalidateCollection() } catch (err) { toast.error(err) }
  }
  const remove = async (name: string) => {
    try { await api.tags.remove(kind, [number], name); await invalidateCollection() } catch (err) { toast.error(err) }
  }
  const suggestions = (all ?? []).filter((t) => !tags.includes(t.name) && (!text || t.name.toLowerCase().includes(text.toLowerCase()))).slice(0, 6)
  return (
    <section className="px-6 pt-6">
      <h3 className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-bold"><TagIcon className="size-4 text-fg-3" />Tags</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-panel-2 pl-2.5 pr-1 text-[12.5px]">
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => void remove(t)} className="grid size-5 place-items-center rounded-full text-fg-4 hover:bg-hover hover:text-fg"><X className="size-3" /></button>
          </span>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); void add(text) }} className="flex items-center">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={tags.length ? 'Add tag' : 'Add a tag, e.g. "Display shelf"'}
            className="h-7 w-[180px] rounded-full border border-dashed border-line-strong bg-transparent px-3 text-[12.5px] text-fg placeholder:text-fg-4 focus:border-accent focus:outline-none" />
        </form>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s.id} type="button" onClick={() => void add(s.name)} className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] text-fg-3 hover:bg-hover hover:text-fg">
              <Plus className="size-3" />{s.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function AlertBox({ kind, number, condition, current }: { kind: EntityKind; number: string; condition: PriceCondition; current: number | null }) {
  const qc = useQueryClient()
  const { data: alerts } = useAlerts()
  const mine = (alerts ?? []).filter((a) => a.entity_type === kind && a.entity_id === number)
  const [direction, setDirection] = useState<'below' | 'above'>('below')
  const [target, setTarget] = useState('')
  const save = async () => {
    const t = Number(target)
    if (!(t > 0)) return
    try {
      await api.alerts.set({ entity_type: kind, entity_id: number, condition, direction, target_price: t })
      setTarget('')
      await qc.invalidateQueries({ queryKey: keys.alerts })
      toast.success(`We'll tell you when it ${direction === 'below' ? 'drops to' : 'rises to'} ${formatMoney(t)}`)
    } catch (err) { toast.error(err) }
  }
  return (
    <section className="px-6 pt-6">
      <h3 className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-bold"><Bell className="size-4 text-fg-3" />Price alert</h3>
      {mine.map((a) => (
        <div key={a.id} className="mb-2 flex items-center gap-3 rounded-[12px] border border-line bg-panel-2/60 px-3 py-2 text-[12.5px]">
          {a.triggered_at ? <BellRing className="size-4 text-accent-text" /> : <Bell className="size-4 text-fg-3" />}
          <span className="flex-1 text-fg-2">
            {a.direction === 'below' ? 'Drops to' : 'Rises to'} <b className="font-mono text-fg">{formatMoney(a.target_price)}</b> ({a.condition})
            {a.triggered_at && <span className="text-accent-text"> · hit {formatDate(a.triggered_at)}</span>}
          </span>
          <IconButton label="Delete alert" size="sm" tone="danger" onClick={async () => { await api.alerts.remove(a.id); await qc.invalidateQueries({ queryKey: keys.alerts }) }}><Trash2 className="size-3.5" /></IconButton>
        </div>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); void save() }} className="flex items-center gap-2">
        <Select value={direction} onChange={(e) => setDirection(e.target.value as 'below' | 'above')} className="w-[150px]" aria-label="Direction">
          <option value="below">Drops to</option><option value="above">Rises to</option>
        </Select>
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-4">$</span>
          <Input inputMode="decimal" className="pl-6" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder={current ? String(Math.round(current * (direction === 'below' ? 0.85 : 1.15))) : 'Target price'} aria-label="Target price" />
        </div>
        <Button type="submit" size="md" disabled={!(Number(target) > 0)}>Set</Button>
      </form>
    </section>
  )
}

function FigLinks({ fig }: { fig: CollectionFig }) {
  const qc = useQueryClient()
  const openSheet = useUi((s) => s.openSheet)
  const [blId, setBlId] = useState(fig.bricklink_id ?? '')
  const [finding, setFinding] = useState(false)
  const rb = fig.rebrickable_id ?? (fig.fig_number.startsWith('fig-') ? fig.fig_number : null)
  const { data: appears } = useQuery({ queryKey: ['fig-sets', rb], queryFn: () => api.collection.figSets(rb!), enabled: !!rb, staleTime: 3_600_000 })
  // The figure now goes by its BrickLink id; keep this sheet on it
  const follow = (number: string) => { if (number !== fig.fig_number) openSheet('minifig', number) }
  const saveBl = async () => {
    try {
      const row = await api.collection.updateFig(fig.id, { bricklink_id: blId.trim() || null })
      await qc.invalidateQueries({ queryKey: ['collection'] })
      follow(row.fig_number)
      toast.success('BrickLink id saved')
    } catch (err) { toast.error(err) }
  }
  const find = async () => {
    setFinding(true)
    try {
      const r = await api.collection.resolveBricklink(fig.id)
      if (r.bricklink_id) {
        setBlId(r.bricklink_id)
        await qc.invalidateQueries({ queryKey: ['collection'] })
        follow(r.bricklink_id)
        toast.success(`Found it: ${r.bricklink_id}`)
      } else toast.info("Couldn't match this minifigure to BrickLink on its own. Enter its BrickLink id by hand.")
    } catch (err) { toast.error(err) } finally { setFinding(false) }
  }
  return (
    <section className="px-6 pt-6">
      <h3 className="mb-2.5 font-display text-[15px] font-bold">BrickLink id</h3>
      <p className="mb-2 text-[12.5px] text-fg-3">
        {fig.bricklink_id
          ? 'BrickForge knows minifigures by their BrickLink id, and their prices come from it. Change it if the match is wrong.'
          : "Not matched to BrickLink yet, so there's no price. Find it, or enter its BrickLink id (like sw0001a)."}
      </p>
      <form onSubmit={(e) => { e.preventDefault(); void saveBl() }} className="flex items-center gap-2">
        <Input value={blId} onChange={(e) => setBlId(e.target.value)} placeholder="e.g. sw0001a" className="font-mono" aria-label="BrickLink id" />
        <Button type="submit" disabled={blId.trim() === (fig.bricklink_id ?? '')}>Save</Button>
        <Button variant="ghost" icon={<Search className="size-3.5" />} loading={finding} onClick={find}>Find it</Button>
      </form>
      {appears && appears.length > 0 && (
        <div className="mt-5">
          <h4 className="eyebrow mb-2">Appears in {appears.length} set{appears.length === 1 ? '' : 's'}</h4>
          <div className="flex flex-col gap-1">
            {appears.slice(0, 6).map((s) => (
              <div key={s.set_num} className="flex items-center gap-3 rounded-[10px] px-1 py-1">
                <ItemImage src={s.set_img_url} alt={s.name} className="size-9 rounded-[8px]" pad="p-0.5" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{s.name}</span>
                <span className="font-mono text-[11.5px] text-fg-4">{s.set_num} · {s.year}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
