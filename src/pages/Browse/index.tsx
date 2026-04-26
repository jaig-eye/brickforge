import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search, X, ChevronDown, CheckCircle2, Heart, Package, User,
  SlidersHorizontal, ExternalLink, ChevronLeft, ChevronRight, ArrowUpDown, RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Dialog } from '@/components/ui/Dialog'
import { IPC } from '@/lib/ipc-types'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/formatters'
import toast from 'react-hot-toast'

// ── Types ─────────────────────────────────────────────────────────────────────

type BrowseType   = 'sets' | 'minifigs'
type Condition    = 'sealed' | 'open_complete' | 'open_incomplete'
type FigCondition = 'new' | 'used' | 'cracked'

interface RbSet {
  set_num: string; name: string; year: number
  num_parts: number; set_img_url: string; set_url: string
}
interface RbFig {
  set_num: string; name: string
  num_parts: number; set_img_url: string
}
interface Theme { id: number; parent_id: number | null; name: string }
interface SetDetail {
  set: RbSet
  minifigs: { set_num: string; set_name: string; quantity: number; set_img_url: string }[]
}

const SET_SORT_OPTIONS = [
  { value: '-year',      label: 'Newest first' },
  { value: 'year',       label: 'Oldest first' },
  { value: '-num_parts', label: 'Most pieces' },
  { value: 'num_parts',  label: 'Fewest pieces' },
  { value: 'name',       label: 'Name A→Z' },
  { value: '-name',      label: 'Name Z→A' },
]

const FIG_SORT_OPTIONS = [
  { value: 'name',       label: 'Name A→Z' },
  { value: '-name',      label: 'Name Z→A' },
  { value: '-num_parts', label: 'Most parts' },
  { value: 'num_parts',  label: 'Fewest parts' },
]

const PAGE_SIZE = 24

type PriceMap = Record<string, { new?: number; used?: number }>

// ── Pagination ─────────────────────────────────────────────────────────────────

function getPageNums(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (n: number) => void }) {
  if (total <= 1) return null
  const nums = getPageNums(page, total)
  return (
    <div className="flex items-center justify-center gap-1.5 py-6 flex-wrap">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--color-surface-border)] text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:border-[var(--color-surface-muted)] transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />Prev
      </button>

      {nums.map((n, i) =>
        n === '…' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-[var(--color-surface-muted)]">…</span>
        ) : (
          <button
            key={n}
            onClick={() => onPage(n as number)}
            className={cn(
              'w-9 h-9 rounded-lg border text-sm font-semibold transition-colors',
              n === page
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                : 'border-[var(--color-surface-border)] hover:border-[var(--color-surface-muted)]',
            )}
          >
            {n}
          </button>
        )
      )}

      <button
        onClick={() => onPage(page + 1)}
        disabled={page === total}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--color-surface-border)] text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:border-[var(--color-surface-muted)] transition-colors"
      >
        Next<ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Theme selector ─────────────────────────────────────────────────────────────

function ThemeSelect({
  themes, value, onChange,
}: { themes: Theme[]; value: number | null; onChange: (id: number | null) => void }) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const ref = useMemo(() => ({ current: null as HTMLDivElement | null }), [])

  const labeled = useMemo(() => {
    const parentMap = new Map(themes.map((t) => [t.id, t.name]))
    return themes.map((t) => ({
      ...t,
      label: t.parent_id != null
        ? `${parentMap.get(t.parent_id) ?? ''} › ${t.name}`
        : t.name,
    }))
  }, [themes])

  const selectedLabel = labeled.find((t) => t.id === value)?.label ?? ''

  const filtered = query.trim()
    ? labeled.filter((t) => t.label.toLowerCase().includes(query.toLowerCase()))
    : labeled

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref])

  const select = (id: number | null) => { onChange(id); setQuery(''); setOpen(false) }

  return (
    <div ref={(el) => { ref.current = el }} className="relative min-w-[200px]">
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-3 py-2 cursor-pointer text-sm bg-[var(--color-surface-overlay)] transition-colors select-none',
          open ? 'border-[var(--color-accent)]' : 'border-[var(--color-surface-border)]',
        )}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={cn('flex-1 truncate text-sm', !value && 'text-[var(--color-surface-muted)]')}>
          {value ? selectedLabel : 'All themes'}
        </span>
        {value
          ? <button onClick={(e) => { e.stopPropagation(); select(null) }} className="shrink-0 text-[var(--color-surface-muted)] hover:text-current"><X className="h-3.5 w-3.5" /></button>
          : <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-[var(--color-surface-muted)] transition-transform', open && 'rotate-180')} />
        }
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)] shadow-2xl flex flex-col">
          <div className="p-2 border-b border-[var(--color-surface-border)]">
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-surface-muted)]" />
              <input
                autoFocus
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-surface-muted)]"
                placeholder="Search themes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {query && <button onClick={() => setQuery('')}><X className="h-3 w-3 text-[var(--color-surface-muted)]" /></button>}
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto">
            <li
              onMouseDown={() => select(null)}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-overlay)] transition-colors text-[var(--color-surface-muted)]"
            >
              All themes
            </li>
            {filtered.map((t) => (
              <li
                key={t.id}
                onMouseDown={() => select(t.id)}
                className={cn(
                  'px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-overlay)] transition-colors',
                  value === t.id && 'bg-[var(--color-accent)]/20 font-semibold text-[var(--color-accent)]',
                  t.parent_id != null && 'text-[var(--color-surface-muted)]',
                )}
              >
                {t.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Inspect Modal ──────────────────────────────────────────────────────────────

function InspectSetModal({
  item, open, onClose, owned, wanted, onOwn, onWishlist,
}: {
  item: RbSet | null; open: boolean; onClose: () => void
  owned: boolean; wanted: boolean
  onOwn: (item: RbSet, condition: Condition, price: number | null) => void
  onWishlist: (item: RbSet) => void
}) {
  const [detail, setDetail]       = useState<SetDetail | null>(null)
  const [loading, setLoading]     = useState(false)
  const [expanding, setExpanding] = useState(false)
  const [condition, setCondition] = useState<Condition>('open_complete')
  const [price, setPrice]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [prices, setPrices]       = useState<{ new?: number; used?: number } | null>(null)
  const [priceFetching, setPriceFetching] = useState(false)

  useEffect(() => {
    if (!item || !open) { setDetail(null); setExpanding(false); setPrices(null); return }
    setLoading(true)
    window.ipc.invoke(IPC.CATALOG_INSPECT_SET, item.set_num)
      .then((r) => setDetail(r as SetDetail))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
    // Load any cached price for this set
    window.ipc.invoke(IPC.PRICE_GET_BULK, [item.set_num])
      .then((r) => {
        const map = r as Record<string, { new?: number; used?: number }>
        setPrices(map[item.set_num] ?? null)
      })
      .catch(() => {})
  }, [item, open])

  const confirm = async () => {
    if (!item) return
    setSaving(true)
    await onOwn(item, condition, price ? parseFloat(price) : null)
    setSaving(false)
    setExpanding(false)
    onClose()
  }

  const fetchPrice = async () => {
    if (!item) return
    setPriceFetching(true)
    try {
      await Promise.all([
        window.ipc.invoke(IPC.PRICE_FETCH_CURRENT, item.set_num, 'used'),
        window.ipc.invoke(IPC.PRICE_FETCH_CURRENT, item.set_num, 'new'),
      ])
      const map = await window.ipc.invoke(IPC.PRICE_GET_BULK, [item.set_num]) as Record<string, { new?: number; used?: number }>
      setPrices(map[item.set_num] ?? null)
    } catch (err) {
      const msg = String(err).replace(/^Error:\s*/i, '')
      if (msg.includes('credentials not configured')) {
        toast.error('BrickLink API keys not configured — add them in Settings')
      } else {
        toast.error(`Price fetch failed: ${msg}`)
      }
    } finally {
      setPriceFetching(false)
    }
  }

  if (!item) return null
  const set = detail?.set ?? item
  const minifigs = detail?.minifigs ?? []
  const blUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${item.set_num}`

  return (
    <Dialog open={open} onClose={onClose} title={set.name} wide>
      <div className="space-y-5">
        <div className="flex gap-5">
          <div className="w-80 h-80 shrink-0 rounded-xl bg-[var(--color-surface-overlay)] flex items-center justify-center overflow-hidden">
            {set.set_img_url
              ? <img src={set.set_img_url} alt={set.name} className="w-full h-full object-contain p-3" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              : <Package className="h-16 w-16 text-[var(--color-surface-muted)]" />
            }
          </div>
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Set Number</p><p className="font-mono font-semibold text-[var(--color-accent)]">#{set.set_num}</p></div>
              <div><p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Year</p><p className="font-semibold">{set.year}</p></div>
              <div><p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Pieces</p><p className="font-semibold">{set.num_parts?.toLocaleString()}</p></div>
              <div><p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Minifigures</p>
                <p className="font-semibold">{loading ? '…' : minifigs.reduce((s, f) => s + f.quantity, 0)}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap pt-1">
              {set.set_url && (
                <a href={set.set_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[var(--color-surface-muted)] hover:text-current border border-[var(--color-surface-border)] rounded-lg px-2.5 py-1.5 transition-colors"
                  onClick={(e) => { e.preventDefault(); window.ipc.invoke('bf:app:openExternal', set.set_url) }}>
                  <ExternalLink className="h-3.5 w-3.5" />Rebrickable
                </a>
              )}
              <a href={blUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--color-surface-muted)] hover:text-current border border-[var(--color-surface-border)] rounded-lg px-2.5 py-1.5 transition-colors"
                onClick={(e) => { e.preventDefault(); window.ipc.invoke('bf:app:openExternal', blUrl) }}>
                <ExternalLink className="h-3.5 w-3.5" />BrickLink
              </a>
            </div>
          </div>
        </div>

        {loading && <div className="flex items-center gap-2 text-sm text-[var(--color-surface-muted)]"><Spinner size="sm" />Loading details…</div>}
        {!loading && minifigs.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-surface-muted)] mb-2">
              Included Minifigures ({minifigs.reduce((s, f) => s + f.quantity, 0)})
            </p>
            <div className="flex flex-wrap gap-3">
              {minifigs.map((fig) => (
                <div key={fig.set_num} className="flex flex-col items-center gap-1 w-14">
                  <div className="w-14 h-14 rounded-lg bg-[var(--color-surface-overlay)] overflow-hidden flex items-center justify-center">
                    {fig.set_img_url
                      ? <img src={fig.set_img_url} alt={fig.set_name} className="w-full h-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      : <User className="h-5 w-5 text-[var(--color-surface-muted)]" />
                    }
                  </div>
                  <p className="text-xs text-center font-mono text-[var(--color-accent)] leading-tight">{fig.set_num}</p>
                  {fig.quantity > 1 && <p className="text-xs text-[var(--color-surface-muted)]">×{fig.quantity}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BrickLink market prices */}
        <div className="border-t border-[var(--color-surface-border)] pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-surface-muted)]">
              BrickLink Market Prices (US)
            </p>
            <button
              onClick={fetchPrice}
              disabled={priceFetching}
              className="flex items-center gap-1.5 text-xs text-[var(--color-surface-muted)] hover:text-current border border-[var(--color-surface-border)] rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', priceFetching && 'animate-spin')} />
              {priceFetching ? 'Fetching…' : prices ? 'Refresh' : 'Fetch Price'}
            </button>
          </div>
          {prices && (prices.used != null || prices.new != null) ? (
            <div className="grid grid-cols-2 gap-3 mb-1">
              {prices.used != null && (
                <div className="rounded-lg bg-[var(--color-surface-overlay)] p-3 text-center">
                  <p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Used / Open</p>
                  <p className="text-base font-bold tabular-nums">{formatCurrency(prices.used)}</p>
                </div>
              )}
              {prices.new != null && (
                <div className="rounded-lg bg-[var(--color-surface-overlay)] p-3 text-center">
                  <p className="text-xs text-[var(--color-surface-muted)] mb-0.5">New / Sealed</p>
                  <p className="text-base font-bold tabular-nums">{formatCurrency(prices.new)}</p>
                </div>
              )}
            </div>
          ) : (
            !priceFetching && (
              <p className="text-xs text-[var(--color-surface-muted)] mb-1">
                No cached price. Click "Fetch Price" to pull from BrickLink.
              </p>
            )
          )}
        </div>

        <div className="border-t border-[var(--color-surface-border)] pt-4">
          {owned ? (
            <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
              <CheckCircle2 className="h-4 w-4" />In your collection
            </div>
          ) : (
            <div className="space-y-3">
              {!expanding ? (
                <div className="flex gap-2">
                  <Button onClick={() => setExpanding(true)} className="flex-1">Own this set</Button>
                  <Button variant="secondary" onClick={() => { onWishlist(item); onClose() }}
                    className={cn(wanted && 'border-amber-400 bg-amber-400/10')}>
                    {wanted ? <><Heart className="h-3.5 w-3.5" />On wishlist</> : 'Add to wishlist'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-[var(--color-surface-muted)] uppercase tracking-wide mb-2">Condition</p>
                    <div className="flex gap-2">
                      {(['sealed', 'open_complete', 'open_incomplete'] as Condition[]).map((c) => (
                        <button key={c} onClick={() => setCondition(c)}
                          className={cn(
                            'flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors',
                            condition === c ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15' : 'border-[var(--color-surface-border)] text-[var(--color-surface-muted)] hover:border-[var(--color-surface-muted)]',
                          )}>
                          {c === 'sealed' ? 'Sealed' : c === 'open_complete' ? 'Open · Complete' : 'Open · Incomplete'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 flex items-center gap-1.5 border border-[var(--color-surface-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-surface-overlay)]">
                      <span className="text-xs text-[var(--color-surface-muted)]">$</span>
                      <input type="number" min="0" step="0.01" className="flex-1 bg-transparent text-sm outline-none" placeholder="Price paid (optional)" value={price} onChange={(e) => setPrice(e.target.value)} />
                    </div>
                    <Button onClick={confirm} disabled={saving}>{saving ? <Spinner size="sm" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Confirm</Button>
                    <Button variant="ghost" onClick={() => setExpanding(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function InspectFigModal({
  item, open, onClose, owned, wanted, onOwn, onWishlist,
}: {
  item: RbFig | null; open: boolean; onClose: () => void
  owned: boolean; wanted: boolean
  onOwn: (item: RbFig, condition: FigCondition, price: number | null) => void
  onWishlist: (item: RbFig) => void
}) {
  const [prices, setPrices]               = useState<{ new?: number; used?: number } | null>(null)
  const [priceFetching, setPriceFetching] = useState(false)
  const [expanding, setExpanding]         = useState(false)
  const [condition, setCondition]         = useState<FigCondition>('used')
  const [price, setPrice]                 = useState('')
  const [saving, setSaving]               = useState(false)

  useEffect(() => {
    if (!item || !open) { setPrices(null); return }
    window.ipc.invoke(IPC.PRICE_GET_BULK_FIGS, [item.set_num])
      .then((r) => {
        const map = r as Record<string, { new?: number; used?: number }>
        setPrices(map[item.set_num] ?? null)
      })
      .catch(() => {})
  }, [item, open])

  const fetchPrice = async () => {
    if (!item) return
    setPriceFetching(true)
    try {
      await Promise.all([
        window.ipc.invoke(IPC.PRICE_FETCH_FIG, item.set_num, 'used'),
        window.ipc.invoke(IPC.PRICE_FETCH_FIG, item.set_num, 'new'),
      ])
      const map = await window.ipc.invoke(IPC.PRICE_GET_BULK_FIGS, [item.set_num]) as Record<string, { new?: number; used?: number }>
      setPrices(map[item.set_num] ?? null)
    } catch (err) {
      const msg = String(err).replace(/^Error:\s*/i, '')
      if (msg.includes('credentials not configured')) {
        toast.error('BrickLink API keys not configured — add them in Settings')
      } else {
        toast.error(`Price fetch failed: ${msg}`)
      }
    } finally {
      setPriceFetching(false)
    }
  }

  if (!item) return null
  const blUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?M=${item.set_num}`

  return (
    <Dialog open={open} onClose={onClose} title={item.name}>
      <div className="space-y-5">
        <div className="flex gap-5">
          <div className="w-72 h-72 shrink-0 rounded-xl bg-[var(--color-surface-overlay)] flex items-center justify-center overflow-hidden">
            {item.set_img_url
              ? <img src={item.set_img_url} alt={item.name} className="w-full h-full object-contain p-3" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              : <User className="h-16 w-16 text-[var(--color-surface-muted)]" />
            }
          </div>
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Fig Number</p><p className="font-mono font-semibold text-[var(--color-accent)]">{item.set_num}</p></div>
              <div><p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Parts</p><p className="font-semibold">{item.num_parts}</p></div>
            </div>
            <div className="flex gap-2 pt-1">
              <a href={blUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--color-surface-muted)] hover:text-current border border-[var(--color-surface-border)] rounded-lg px-2.5 py-1.5 transition-colors"
                onClick={(e) => { e.preventDefault(); window.ipc.invoke('bf:app:openExternal', blUrl) }}>
                <ExternalLink className="h-3.5 w-3.5" />BrickLink
              </a>
            </div>
          </div>
        </div>

        {/* BrickLink market prices */}
        <div className="border-t border-[var(--color-surface-border)] pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-surface-muted)]">
              BrickLink Market Prices (US)
            </p>
            <button
              onClick={fetchPrice}
              disabled={priceFetching}
              className="flex items-center gap-1.5 text-xs text-[var(--color-surface-muted)] hover:text-current border border-[var(--color-surface-border)] rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', priceFetching && 'animate-spin')} />
              {priceFetching ? 'Fetching...' : prices ? 'Refresh' : 'Fetch Price'}
            </button>
          </div>
          {prices && (prices.used != null || prices.new != null) ? (
            <div className="grid grid-cols-2 gap-3 mb-1">
              {prices.used != null && (
                <div className="rounded-lg bg-[var(--color-surface-overlay)] p-3 text-center">
                  <p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Used</p>
                  <p className="text-base font-bold tabular-nums">{formatCurrency(prices.used)}</p>
                </div>
              )}
              {prices.new != null && (
                <div className="rounded-lg bg-[var(--color-surface-overlay)] p-3 text-center">
                  <p className="text-xs text-[var(--color-surface-muted)] mb-0.5">New</p>
                  <p className="text-base font-bold tabular-nums">{formatCurrency(prices.new)}</p>
                </div>
              )}
            </div>
          ) : (
            !priceFetching && (
              <p className="text-xs text-[var(--color-surface-muted)] mb-1">
                No cached price. Click "Fetch Price" to pull from BrickLink.
              </p>
            )
          )}
        </div>

        <div className="border-t border-[var(--color-surface-border)] pt-4 space-y-3">
          {owned ? (
            <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
              <CheckCircle2 className="h-4 w-4" />In your collection
            </div>
          ) : !expanding ? (
            <div className="flex gap-2">
              <Button onClick={() => setExpanding(true)} className="flex-1">Own this minifigure</Button>
              <Button variant="secondary" onClick={() => { onWishlist(item); onClose() }}
                className={cn(wanted && 'border-amber-400 bg-amber-400/10')}>
                {wanted ? <><Heart className="h-3.5 w-3.5" />On wishlist</> : 'Add to wishlist'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['new', 'used', 'cracked'] as FigCondition[]).map((c) => (
                  <button key={c} onClick={() => setCondition(c)}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg border text-xs font-semibold capitalize transition-colors',
                      condition === c ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15' : 'border-[var(--color-surface-border)] text-[var(--color-surface-muted)] hover:border-[var(--color-surface-muted)]',
                    )}>
                    {c === 'new' ? 'New' : c === 'used' ? 'Used' : 'Cracked'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex-1 flex items-center gap-1.5 border border-[var(--color-surface-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-surface-overlay)]">
                  <span className="text-xs text-[var(--color-surface-muted)]">$</span>
                  <input type="number" min="0" step="0.01" className="flex-1 bg-transparent text-sm outline-none" placeholder="Price paid (optional)" value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
                <Button size="sm" onClick={async () => {
                  setSaving(true)
                  await onOwn(item, condition, price ? parseFloat(price) : null)
                  setSaving(false)
                  onClose()
                }} disabled={saving}>
                  {saving ? <Spinner size="sm" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Confirm
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setExpanding(false); setPrice('') }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

// ── Set card ──────────────────────────────────────────────────────────────────

function SetItem({
  item, owned, wanted, marketPrice, onOwn, onWishlist, onInspect,
}: {
  item: RbSet; owned: boolean; wanted: boolean
  marketPrice?: { new?: number; used?: number }
  onOwn: (item: RbSet, condition: Condition, price: number | null) => void
  onWishlist: (item: RbSet) => void
  onInspect: (item: RbSet) => void
}) {
  const [expanding, setExpanding] = useState(false)
  const [condition, setCondition] = useState<Condition>('open_complete')
  const [price, setPrice]         = useState('')
  const [saving, setSaving]       = useState(false)

  const confirm = async () => {
    setSaving(true)
    await onOwn(item, condition, price ? parseFloat(price) : null)
    setSaving(false)
    setExpanding(false)
  }

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden transition-colors',
      owned ? 'border-green-500/40' : wanted ? 'border-amber-500/30' : 'border-[var(--color-surface-border)]',
      'bg-[var(--color-surface-raised)]',
    )}>
      <div className="flex gap-3 p-3">
        <div className="w-16 h-16 shrink-0 rounded-lg bg-[var(--color-surface-overlay)] overflow-hidden flex items-center justify-center cursor-pointer" onClick={() => onInspect(item)}>
          {item.set_img_url
            ? <img src={item.set_img_url} alt={item.name} className="w-full h-full object-contain p-1 hover:scale-110 transition-transform" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            : <Package className="h-6 w-6 text-[var(--color-surface-muted)]" />
          }
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onInspect(item)}>
          <p className="text-xs font-mono text-[var(--color-accent)]">
            #{item.set_num}<span className="text-[var(--color-surface-muted)] font-sans"> · {item.year}</span>
          </p>
          <p className="text-sm font-semibold leading-snug line-clamp-2">{item.name}</p>
          <p className="text-xs text-[var(--color-surface-muted)] mt-0.5">{item.num_parts.toLocaleString()} pcs</p>
          {marketPrice && (marketPrice.used != null || marketPrice.new != null) && (
            <p className="text-xs text-[var(--color-surface-muted)] mt-0.5 leading-snug">
              {marketPrice.used != null && (
                <span>Used: <span className="font-semibold text-current">{formatCurrency(marketPrice.used)}</span></span>
              )}
              {marketPrice.used != null && marketPrice.new != null && ' · '}
              {marketPrice.new != null && (
                <span>New: <span className="font-semibold text-current">{formatCurrency(marketPrice.new)}</span></span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0 justify-center">
          {owned ? (
            <span className="flex items-center gap-1 text-xs text-green-400 font-semibold px-1 py-0.5"><CheckCircle2 className="h-3.5 w-3.5" />Owned</span>
          ) : (
            <>
              <Button size="sm" onClick={() => setExpanding((x) => !x)} className="text-xs h-7 px-2.5">Own</Button>
              <Button variant={wanted ? 'secondary' : 'ghost'} size="sm" onClick={() => onWishlist(item)} className="text-xs h-7 px-2.5">
                {wanted ? <Heart className="h-3 w-3" /> : null}{wanted ? 'Listed' : 'Wishlist'}
              </Button>
            </>
          )}
        </div>
      </div>
      {expanding && !owned && (
        <div className="border-t border-[var(--color-surface-border)] px-3 py-3 bg-[var(--color-surface-overlay)] space-y-3">
          <div className="flex gap-2">
            {(['sealed', 'open_complete', 'open_incomplete'] as Condition[]).map((c) => (
              <button key={c} onClick={() => setCondition(c)}
                className={cn(
                  'flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors',
                  condition === c ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15' : 'border-[var(--color-surface-border)] text-[var(--color-surface-muted)] hover:border-[var(--color-surface-muted)]',
                )}>
                {c === 'sealed' ? 'Sealed' : c === 'open_complete' ? 'Open · Complete' : 'Open · Incomplete'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex-1 flex items-center gap-1.5 border border-[var(--color-surface-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-surface-overlay)]">
              <span className="text-xs text-[var(--color-surface-muted)]">$</span>
              <input type="number" min="0" step="0.01" className="flex-1 bg-transparent text-sm outline-none" placeholder="Price paid (optional)" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <Button size="sm" onClick={confirm} disabled={saving}>{saving ? <Spinner size="sm" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Add</Button>
            <Button variant="ghost" size="sm" onClick={() => setExpanding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function FigItem({
  item, owned, wanted, onOwn, onWishlist, onInspect,
}: {
  item: RbFig; owned: boolean; wanted: boolean
  onOwn: (item: RbFig, condition: FigCondition, price: number | null) => void
  onWishlist: (item: RbFig) => void
  onInspect: (item: RbFig) => void
}) {
  const [expanding, setExpanding] = useState(false)
  const [condition, setCondition] = useState<FigCondition>('used')
  const [price, setPrice]         = useState('')
  const [saving, setSaving]       = useState(false)

  const confirm = async () => {
    setSaving(true)
    await onOwn(item, condition, price ? parseFloat(price) : null)
    setSaving(false)
    setExpanding(false)
    setPrice('')
  }

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden transition-colors',
      owned ? 'border-green-500/40' : wanted ? 'border-amber-500/30' : 'border-[var(--color-surface-border)]',
      'bg-[var(--color-surface-raised)]',
    )}>
      <div className="flex gap-3 p-3">
        <div className="w-14 h-14 shrink-0 rounded-lg bg-[var(--color-surface-overlay)] overflow-hidden flex items-center justify-center cursor-pointer" onClick={() => onInspect(item)}>
          {item.set_img_url
            ? <img src={item.set_img_url} alt={item.name} className="w-full h-full object-contain p-1 hover:scale-110 transition-transform" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            : <User className="h-5 w-5 text-[var(--color-surface-muted)]" />
          }
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onInspect(item)}>
          <p className="text-xs font-mono text-[var(--color-accent)]">{item.set_num}</p>
          <p className="text-sm font-semibold leading-snug line-clamp-2">{item.name}</p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0 justify-center">
          {owned ? (
            <span className="flex items-center gap-1 text-xs text-green-400 font-semibold px-1 py-0.5"><CheckCircle2 className="h-3.5 w-3.5" />Owned</span>
          ) : (
            <>
              <Button size="sm" onClick={() => setExpanding((x) => !x)} className="text-xs h-7 px-2.5">Own</Button>
              <Button variant={wanted ? 'secondary' : 'ghost'} size="sm" onClick={() => onWishlist(item)} className="text-xs h-7 px-2.5">
                {wanted ? <Heart className="h-3 w-3" /> : null}{wanted ? 'Listed' : 'Wishlist'}
              </Button>
            </>
          )}
        </div>
      </div>
      {expanding && !owned && (
        <div className="border-t border-[var(--color-surface-border)] px-3 py-3 bg-[var(--color-surface-overlay)] space-y-3">
          <div className="flex gap-2">
            {(['new', 'used', 'cracked'] as FigCondition[]).map((c) => (
              <button key={c} onClick={() => setCondition(c)}
                className={cn(
                  'flex-1 py-1.5 rounded-lg border text-xs font-semibold capitalize transition-colors',
                  condition === c ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15' : 'border-[var(--color-surface-border)] text-[var(--color-surface-muted)] hover:border-[var(--color-surface-muted)]',
                )}>
                {c === 'new' ? 'New' : c === 'used' ? 'Used' : 'Cracked'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex-1 flex items-center gap-1.5 border border-[var(--color-surface-border)] rounded-lg px-2.5 py-1.5 bg-[var(--color-surface-overlay)]">
              <span className="text-xs text-[var(--color-surface-muted)]">$</span>
              <input type="number" min="0" step="0.01" className="flex-1 bg-transparent text-sm outline-none" placeholder="Price paid (optional)" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <Button size="sm" onClick={confirm} disabled={saving}>{saving ? <Spinner size="sm" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Add</Button>
            <Button variant="ghost" size="sm" onClick={() => { setExpanding(false); setPrice('') }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function NavToast({ name, onNav }: { name: string; onNav: () => void }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      Added {name}
      <button onClick={onNav}
        style={{ fontWeight: 700, textDecoration: 'underline', cursor: 'pointer',
                 background: 'none', border: 'none', color: 'inherit', fontSize: 'inherit', padding: 0 }}>
        View in Collection →
      </button>
    </span>
  )
}

export default function Browse() {
  const navigate = useNavigate()
  const [type, setType]           = useState<BrowseType>('sets')
  const [themes, setThemes]       = useState<Theme[]>([])
  const [themeId, setThemeId]     = useState<number | null>(null)
  const [search, setSearch]       = useState('')
  const [hideOwned, setHideOwned] = useState(false)
  const [ordering, setOrdering]   = useState('-year')

  const [sets, setSets]           = useState<RbSet[]>([])
  const [figs, setFigs]           = useState<RbFig[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(false)

  const [ownedSets,  setOwnedSets]  = useState<Set<string>>(new Set())
  const [wantedSets, setWantedSets] = useState<Set<string>>(new Set())
  const [ownedFigs,  setOwnedFigs]  = useState<Set<string>>(new Set())
  const [wantedFigs, setWantedFigs] = useState<Set<string>>(new Set())

  const [inspectSet, setInspectSet] = useState<RbSet | null>(null)
  const [inspectFig, setInspectFig] = useState<RbFig | null>(null)
  const [browsePriceMap, setBrowsePriceMap] = useState<PriceMap>({})

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const sortOptions = type === 'sets' ? SET_SORT_OPTIONS : FIG_SORT_OPTIONS

  // ── Load themes + owned nums once ─────────────────────────────────────────
  useEffect(() => {
    window.ipc.invoke(IPC.CATALOG_THEMES).then((r) => setThemes(r as Theme[]))
    refreshOwned()
  }, [])

  // ── Keep price map in sync with owned sets ────────────────────────────────
  useEffect(() => {
    const nums = Array.from(ownedSets)
    if (!nums.length) { setBrowsePriceMap({}); return }
    window.ipc.invoke(IPC.PRICE_GET_BULK, nums)
      .then((r) => setBrowsePriceMap(r as PriceMap))
      .catch(() => {})
  }, [ownedSets])

  const refreshOwned = () => {
    window.ipc.invoke(IPC.SETS_LIST, {}).then((s) => {
      const all = s as { set_number: string; is_owned: number; is_wanted: number }[]
      setOwnedSets(new Set(all.filter((x) => x.is_owned).map((x) => x.set_number)))
      setWantedSets(new Set(all.filter((x) => x.is_wanted).map((x) => x.set_number)))
    })
    window.ipc.invoke(IPC.FIGS_LIST, {}).then((f) => {
      const all = f as { fig_number: string; is_owned: number; is_wanted: number }[]
      setOwnedFigs(new Set(all.filter((x) => x.is_owned).map((x) => x.fig_number)))
      setWantedFigs(new Set(all.filter((x) => x.is_wanted).map((x) => x.fig_number)))
    })
  }

  // ── Core fetch (always replaces current results) ──────────────────────────
  const fetchPage = useCallback(async (pageNum: number, ord?: string) => {
    setLoading(true)
    try {
      const activeOrdering = ord ?? ordering
      const opts = {
        search: search.trim() || undefined,
        theme_id: themeId ?? undefined,
        page: pageNum,
        page_size: PAGE_SIZE,
        ordering: activeOrdering,
      }
      if (type === 'sets') {
        const res = await window.ipc.invoke(IPC.CATALOG_BROWSE_SETS, opts) as { count: number; results: RbSet[] }
        setSets(res.results); setTotalCount(res.count)
      } else {
        const res = await window.ipc.invoke(IPC.CATALOG_BROWSE_MINIFIGS, opts) as { count: number; results: RbFig[] }
        setFigs(res.results); setTotalCount(res.count)
      }
    } catch (err) { toast.error(String(err)) }
    finally { setLoading(false) }
  }, [type, themeId, search, ordering])

  // ── Reset to page 1 when filters change; debounce search ─────────────────
  useEffect(() => {
    setPage(1)
    const t = setTimeout(() => fetchPage(1), search ? 400 : 0)
    return () => clearTimeout(t)
  }, [fetchPage, search])

  // ── Pagination click ──────────────────────────────────────────────────────
  const goToPage = (n: number) => {
    if (n < 1 || n > totalPages || n === page) return
    setPage(n)
    fetchPage(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Type switch: reset ordering to type default ───────────────────────────
  const switchType = (t: BrowseType) => {
    if (type === t) return
    const defaultOrd = t === 'sets' ? '-year' : 'name'
    setType(t)
    setOrdering(defaultOrd)
    setSets([]); setFigs([])
  }

  // ── Sort change ───────────────────────────────────────────────────────────
  const changeOrdering = (ord: string) => {
    setOrdering(ord)
    setPage(1)
    fetchPage(1, ord)
  }

  // ── Add actions ───────────────────────────────────────────────────────────
  const addSet = useCallback(async (item: RbSet, condition: Condition, price: number | null, isOwned: boolean) => {
    try {
      await window.ipc.invoke(IPC.CATALOG_ADD_SET, { ...item, is_owned: isOwned ? 1 : 0, is_wanted: isOwned ? 0 : 1, condition, acquired_price: price })
      if (isOwned) setOwnedSets((s) => new Set([...s, item.set_num]))
      else         setWantedSets((s) => new Set([...s, item.set_num]))
      if (isOwned) {
        toast((t) => <NavToast name={item.name} onNav={() => { toast.dismiss(t.id); navigate('/collection') }} />, { duration: 5000 })
      } else {
        toast.success(`${item.name} added to wishlist`)
      }
    } catch (err) { toast.error(String(err)) }
  }, [navigate])

  const addFig = useCallback(async (item: RbFig, condition: FigCondition, price: number | null, isOwned: boolean) => {
    try {
      await window.ipc.invoke(IPC.CATALOG_ADD_FIG, { ...item, is_owned: isOwned ? 1 : 0, is_wanted: isOwned ? 0 : 1, condition, acquired_price: price })
      if (isOwned) setOwnedFigs((s) => new Set([...s, item.set_num]))
      else         setWantedFigs((s) => new Set([...s, item.set_num]))
      if (isOwned) {
        toast((t) => <NavToast name={item.name} onNav={() => { toast.dismiss(t.id); navigate('/collection') }} />, { duration: 5000 })
      } else {
        toast.success(`${item.name} added to wishlist`)
      }
    } catch (err) { toast.error(String(err)) }
  }, [navigate])

  const visibleSets  = hideOwned ? sets.filter((s) => !ownedSets.has(s.set_num)) : sets
  const visibleFigs  = hideOwned ? figs.filter((f) => !ownedFigs.has(f.set_num)) : figs
  const visibleCount = type === 'sets' ? visibleSets.length : visibleFigs.length

  const currentSortLabel = sortOptions.find((o) => o.value === ordering)?.label ?? 'Sort'

  return (
    <PageShell title="Browse Catalog" subtitle="Search all LEGO sets and minifigures — add directly to your collection">

      {/* ── Sticky filter bar ── */}
      <div className="sticky top-0 z-10 bg-[var(--color-surface-base)] border-b border-[var(--color-surface-border)] px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Type toggle */}
          <div className="flex gap-1 bg-[var(--color-surface-overlay)] rounded-lg p-1 shrink-0">
            {(['sets', 'minifigs'] as BrowseType[]).map((t) => (
              <button
                key={t}
                onClick={() => switchType(t)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-semibold font-display capitalize transition-colors',
                  type === t ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'hover:bg-[var(--color-surface-border)]',
                )}
              >
                {t === 'sets' ? 'Sets' : 'Minifigures'}
              </button>
            ))}
          </div>

          {/* Theme */}
          <ThemeSelect themes={themes} value={themeId} onChange={setThemeId} />

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-[180px] rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-surface-muted)]" />
            <input
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-surface-muted)]"
              placeholder={`Search ${type === 'sets' ? 'sets' : 'minifigures'}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && <button onClick={() => setSearch('')}><X className="h-3.5 w-3.5 text-[var(--color-surface-muted)] hover:text-current" /></button>}
          </div>

          {/* Sort */}
          <div className="relative shrink-0">
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] px-3 py-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-[var(--color-surface-muted)] shrink-0" />
              <select
                value={ordering}
                onChange={(e) => changeOrdering(e.target.value)}
                className="bg-transparent text-sm outline-none cursor-pointer pr-1"
                style={{ appearance: 'none', WebkitAppearance: 'none' }}
              >
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-[var(--color-surface-muted)] shrink-0 pointer-events-none" />
            </div>
          </div>

          {/* Hide owned */}
          <button
            onClick={() => setHideOwned((h) => !h)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shrink-0',
              hideOwned ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10' : 'border-[var(--color-surface-border)] hover:border-[var(--color-surface-muted)]',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Hide owned
          </button>
        </div>

        {!loading && totalCount > 0 && (
          <p className="text-xs text-[var(--color-surface-muted)] mt-2">
            {visibleCount.toLocaleString()} shown on page {page} of {totalPages.toLocaleString()} · {totalCount.toLocaleString()} total results
          </p>
        )}
      </div>

      {/* ── Results ── */}
      <div className="p-6">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-24">
            <Spinner size="lg" />
            <p className="text-sm text-[var(--color-surface-muted)]">Loading catalog…</p>
          </div>
        ) : visibleCount === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-[var(--color-surface-muted)]">
            <Package className="h-12 w-12 opacity-30" />
            <p className="text-sm">No results — try adjusting your filters</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {type === 'sets'
                ? visibleSets.map((s) => (
                    <SetItem key={s.set_num} item={s}
                      owned={ownedSets.has(s.set_num)} wanted={wantedSets.has(s.set_num)}
                      marketPrice={browsePriceMap[s.set_num]}
                      onOwn={(item, cond, price) => addSet(item, cond, price, true)}
                      onWishlist={(item) => addSet(item, 'open_complete', null, false)}
                      onInspect={setInspectSet}
                    />
                  ))
                : visibleFigs.map((f) => (
                    <FigItem key={f.set_num} item={f}
                      owned={ownedFigs.has(f.set_num)} wanted={wantedFigs.has(f.set_num)}
                      onOwn={(item, cond, price) => addFig(item, cond, price, true)}
                      onWishlist={(item) => addFig(item, 'used', null, false)}
                      onInspect={setInspectFig}
                    />
                  ))
              }
            </div>

            <Pagination page={page} total={totalPages} onPage={goToPage} />
          </>
        )}
      </div>

      {/* ── Inspect modals ── */}
      <InspectSetModal
        item={inspectSet}
        open={!!inspectSet}
        onClose={() => setInspectSet(null)}
        owned={inspectSet ? ownedSets.has(inspectSet.set_num) : false}
        wanted={inspectSet ? wantedSets.has(inspectSet.set_num) : false}
        onOwn={(item, cond, price) => addSet(item, cond, price, true)}
        onWishlist={(item) => addSet(item, 'open_complete', null, false)}
      />
      <InspectFigModal
        item={inspectFig}
        open={!!inspectFig}
        onClose={() => setInspectFig(null)}
        owned={inspectFig ? ownedFigs.has(inspectFig.set_num) : false}
        wanted={inspectFig ? wantedFigs.has(inspectFig.set_num) : false}
        onOwn={(item, cond, price) => addFig(item, cond, price, true)}
        onWishlist={(item) => addFig(item, 'used', null, false)}
      />
    </PageShell>
  )
}
