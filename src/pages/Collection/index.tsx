import { useState, useCallback, useEffect } from 'react'
import {
  Plus, Search, Package, User, RefreshCw, TrendingUp, TrendingDown, Minus,
  ExternalLink, CheckCircle2, Trash2,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Badge'
import { SetCard } from '@/components/shared/SetCard'
import { MinifigCard } from '@/components/shared/MinifigCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { useSets, useMinifigures } from '@/hooks/useCollection'
import { IPC } from '@/lib/ipc-types'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/cn'
import toast from 'react-hot-toast'

type OwnershipTab = 'owned' | 'wanted' | 'all'
type TypeTab      = 'sets' | 'minifigs'

interface RebrickableResult {
  set_num: string; name: string; year: number
  num_parts: number; set_img_url: string
}
interface RebrickableFigResult {
  set_num: string; name: string
  num_parts: number; set_img_url: string
}
interface PortfolioStats {
  used_value: number; new_value: number
  acquired_total: number; retail_total: number
  set_count: number; wanted_count: number
  priced_count: number; minifig_count: number
  fig_used_value: number; fig_new_value: number
  fig_acquired_total: number; fig_priced_count: number
}
type PriceMap = Record<string, { new?: number; used?: number }>

interface LegoSetDetail {
  id: number; set_number: string; name: string; year: number | null
  theme: string | null; piece_count: number | null; image_url: string | null
  rebrickable_url: string | null; bricklink_url: string | null; notes: string | null
  is_owned: 0 | 1; is_wanted: 0 | 1
  condition: 'sealed' | 'open_complete' | 'open_incomplete' | 'new' | 'used'
  acquired_price: number | null; retail_price_usd: number | null
}
interface MinifigDetail {
  id: number; fig_number: string; name: string; character: string | null
  theme: string | null; image_url: string | null; bricklink_url: string | null
  bricklink_id: string | null
  is_owned: 0 | 1; is_wanted: 0 | 1; quantity: number
  condition: 'new' | 'used' | 'cracked'; acquired_price: number | null
}

// ── Portfolio stats bar ────────────────────────────────────────────────────────

function StatCard({ label, value, sub, trend }: {
  label: string; value: string; sub: string; trend?: 'up' | 'down' | 'flat'
}) {
  return (
    <div className="rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xl font-bold font-display tabular-nums">{value}</p>
        {trend === 'up'   && <TrendingUp   className="h-4 w-4 text-green-400 shrink-0 mt-1" />}
        {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-400   shrink-0 mt-1" />}
        {trend === 'flat' && <Minus        className="h-4 w-4 text-[var(--color-surface-muted)] shrink-0 mt-1" />}
      </div>
      <p className="text-sm font-medium mt-0.5">{label}</p>
      <p className="text-xs text-[var(--color-surface-muted)]">{sub}</p>
    </div>
  )
}

// ── Set Detail Dialog ──────────────────────────────────────────────────────────

function SetDetailDialog({ set, marketPrice, open, onClose, onDeleted }: {
  set: LegoSetDetail | null
  marketPrice?: number | null
  open: boolean
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!set) return
    setDeleting(true)
    try {
      await window.ipc.invoke(IPC.SETS_DELETE, set.id)
      toast.success(`Removed ${set.name}`)
      onClose()
      onDeleted()
    } catch (err) { toast.error(String(err)) }
    finally { setDeleting(false); setConfirmDelete(false) }
  }

  if (!set) return null
  const paid = set.acquired_price ?? null
  const gain = paid != null && marketPrice != null ? marketPrice - paid : null
  const blUrl = set.bricklink_url ?? `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${set.set_number}`
  const rbUrl = set.rebrickable_url

  const COND_LABEL: Record<string, string> = {
    sealed: 'Sealed', open_complete: 'Open · Complete', open_incomplete: 'Open · Incomplete',
    new: 'New/Sealed', used: 'Open/Used',
  }

  return (
    <Dialog open={open} onClose={onClose} title={set.name} wide>
      <div className="space-y-5">
        <div className="flex gap-5">
          <div className="w-64 h-64 shrink-0 rounded-xl bg-[var(--color-surface-overlay)] flex items-center justify-center overflow-hidden">
            {set.image_url
              ? <img src={set.image_url} alt={set.name} className="w-full h-full object-contain p-3" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              : <Package className="h-16 w-16 text-[var(--color-surface-muted)]" />
            }
          </div>
          <div className="flex-1 space-y-3 min-w-0">
            <div>
              <p className="font-mono font-bold text-[var(--color-accent)] text-sm">#{set.set_number}</p>
              <p className="text-lg font-semibold font-display leading-tight">{set.name}</p>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {set.year && <Badge variant="outline" className="text-xs">{set.year}</Badge>}
              {set.theme && <Badge variant="muted" className="text-xs">{set.theme}</Badge>}
              {set.condition && <Badge variant="info" className="text-xs">{COND_LABEL[set.condition] ?? set.condition}</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Pieces</p>
                <p className="font-semibold">{set.piece_count?.toLocaleString() ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Paid</p>
                <p className="font-semibold">{paid != null ? formatCurrency(paid) : '—'}</p>
              </div>
              {set.retail_price_usd != null && (
                <div>
                  <p className="text-xs text-[var(--color-surface-muted)] mb-0.5">MSRP</p>
                  <p className="font-semibold">{formatCurrency(set.retail_price_usd)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Market</p>
                <p className="font-semibold">{marketPrice != null ? formatCurrency(marketPrice) : '—'}</p>
              </div>
            </div>
            {gain != null && (
              <div className={cn('flex items-center gap-1.5 text-sm font-bold', gain >= 0 ? 'text-green-400' : 'text-red-400')}>
                {gain >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {gain >= 0 ? '+' : ''}{formatCurrency(gain)} vs. paid
              </div>
            )}
            <div className="flex gap-2 flex-wrap pt-1">
              {rbUrl && (
                <a href={rbUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[var(--color-surface-muted)] hover:text-current border border-[var(--color-surface-border)] rounded-lg px-2.5 py-1.5 transition-colors"
                  onClick={(e) => { e.preventDefault(); window.ipc.invoke('bf:app:openExternal', rbUrl) }}>
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
        {set.notes && (
          <div className="border-t border-[var(--color-surface-border)] pt-3">
            <p className="text-xs font-semibold text-[var(--color-surface-muted)] uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm">{set.notes}</p>
          </div>
        )}
        <div className="border-t border-[var(--color-surface-border)] pt-3 flex justify-end">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs text-[var(--color-surface-muted)] hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />Remove from collection
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-xs text-red-400">Remove {set.name}?</p>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} className="text-xs h-7">Cancel</Button>
              <Button size="sm" onClick={handleDelete} disabled={deleting}
                className="text-xs h-7 bg-red-500 hover:bg-red-600 border-red-500">
                {deleting ? <Spinner size="sm" /> : <Trash2 className="h-3 w-3" />}Remove
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

// ── Fig Detail Dialog ──────────────────────────────────────────────────────────

function FigDetailDialog({ fig, marketPrices, open, onClose, onDeleted }: {
  fig: MinifigDetail | null
  marketPrices?: { new?: number; used?: number }
  open: boolean
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [blId, setBlId] = useState(fig?.bricklink_id ?? '')

  useEffect(() => { setBlId(fig?.bricklink_id ?? '') }, [fig])

  const saveBricklinkId = async () => {
    if (!fig) return
    const trimmed = blId.trim()
    await window.ipc.invoke(IPC.FIGS_SET_BRICKLINK_ID, fig.fig_number, trimmed)
    toast.success(trimmed ? `BrickLink ID saved: ${trimmed}` : 'BrickLink ID cleared')
  }

  const handleDelete = async () => {
    if (!fig) return
    setDeleting(true)
    try {
      await window.ipc.invoke(IPC.FIGS_DELETE, fig.id)
      toast.success(`Removed ${fig.name}`)
      onClose()
      onDeleted()
    } catch (err) { toast.error(String(err)) }
    finally { setDeleting(false); setConfirmDelete(false) }
  }

  if (!fig) return null
  const blUrl = fig.bricklink_url ?? `https://www.bricklink.com/v2/catalog/catalogitem.page?M=${fig.fig_number}`
  const COND_LABEL: Record<string, string> = { new: 'New', used: 'Used', cracked: 'Cracked' }

  return (
    <Dialog open={open} onClose={onClose} title={fig.name}>
      <div className="space-y-5">
        <div className="flex gap-5">
          <div className="w-56 h-56 shrink-0 rounded-xl bg-[var(--color-surface-overlay)] flex items-center justify-center overflow-hidden">
            {fig.image_url
              ? <img src={fig.image_url} alt={fig.name} className="w-full h-full object-contain p-3" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              : <User className="h-16 w-16 text-[var(--color-surface-muted)]" />
            }
          </div>
          <div className="flex-1 space-y-3 min-w-0">
            <div>
              <p className="font-mono font-bold text-[var(--color-accent)] text-sm">{fig.fig_number}</p>
              <p className="text-lg font-semibold font-display leading-tight">{fig.name}</p>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {fig.character && <Badge variant="outline" className="text-xs">{fig.character}</Badge>}
              {fig.theme && <Badge variant="muted" className="text-xs">{fig.theme}</Badge>}
              {fig.condition && <Badge variant="info" className="text-xs">{COND_LABEL[fig.condition] ?? fig.condition}</Badge>}
            </div>
            {fig.acquired_price != null && (
              <div>
                <p className="text-xs text-[var(--color-surface-muted)] mb-0.5">Paid</p>
                <p className="text-sm font-semibold">{formatCurrency(fig.acquired_price)}</p>
              </div>
            )}
            {(marketPrices?.new != null || marketPrices?.used != null) && (
              <div>
                <p className="text-xs text-[var(--color-surface-muted)] uppercase tracking-wide font-semibold mb-2">BrickLink Market</p>
                <div className="grid grid-cols-2 gap-2">
                  {marketPrices?.used != null && (
                    <div className="rounded-lg bg-[var(--color-surface-overlay)] p-2.5 text-center">
                      <p className="text-xs text-[var(--color-surface-muted)]">Used</p>
                      <p className="text-sm font-bold tabular-nums">{formatCurrency(marketPrices.used)}</p>
                    </div>
                  )}
                  {marketPrices?.new != null && (
                    <div className="rounded-lg bg-[var(--color-surface-overlay)] p-2.5 text-center">
                      <p className="text-xs text-[var(--color-surface-muted)]">New</p>
                      <p className="text-sm font-bold tabular-nums">{formatCurrency(marketPrices.new)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="pt-1 space-y-2">
              <a href={blUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--color-surface-muted)] hover:text-current border border-[var(--color-surface-border)] rounded-lg px-2.5 py-1.5 transition-colors w-fit"
                onClick={(e) => { e.preventDefault(); window.ipc.invoke('bf:app:openExternal', blUrl) }}>
                <ExternalLink className="h-3.5 w-3.5" />BrickLink
              </a>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--color-surface-muted)] uppercase tracking-wide">
                  BrickLink ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={blId}
                    onChange={(e) => setBlId(e.target.value)}
                    placeholder="e.g. sw0001"
                    className="flex-1 rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                  <Button variant="outline" onClick={saveBricklinkId} className="shrink-0 text-xs">
                    Save
                  </Button>
                </div>
                <p className="text-xs text-[var(--color-surface-muted)] mt-1">
                  Used for price lookups. Find it at bricklink.com.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--color-surface-border)] pt-3 flex justify-end">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs text-[var(--color-surface-muted)] hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />Remove from collection
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-xs text-red-400">Remove {fig.name}?</p>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} className="text-xs h-7">Cancel</Button>
              <Button size="sm" onClick={handleDelete} disabled={deleting}
                className="text-xs h-7 bg-red-500 hover:bg-red-600 border-red-500">
                {deleting ? <Spinner size="sm" /> : <Trash2 className="h-3 w-3" />}Remove
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}

// ── Add Set Dialog ─────────────────────────────────────────────────────────────

function AddSetDialog({ open, onClose, onAdded }: {
  open: boolean; onClose: () => void; onAdded: () => void
}) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<RebrickableResult[]>([])
  const [searching, setSearching] = useState(false)
  const [expanding, setExpanding] = useState<string | null>(null)
  const [condition, setCondition] = useState<'sealed' | 'open_complete' | 'open_incomplete'>('open_complete')
  const [price, setPrice]     = useState('')
  const [adding, setAdding]   = useState<string | null>(null)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const res = await window.ipc.invoke(IPC.SETS_SEARCH_REBRICK, q) as RebrickableResult[]
      setResults(res ?? [])
    } catch { setResults([]) }
    finally { setSearching(false) }
  }, [])

  const handleQueryChange = (q: string) => {
    setQuery(q)
    clearTimeout((handleQueryChange as unknown as { t?: ReturnType<typeof setTimeout> }).t)
    ;(handleQueryChange as unknown as { t?: ReturnType<typeof setTimeout> }).t = setTimeout(() => search(q), 400)
  }

  const addSet = async (r: RebrickableResult, owned: boolean) => {
    setAdding(r.set_num)
    try {
      const imported = await window.ipc.invoke(IPC.SETS_IMPORT_REBRICK, r.set_num) as { set_number?: string } | null
      if (!imported?.set_number) { toast.error('Import failed — check your Rebrickable API key'); return }
      await window.ipc.invoke(IPC.SETS_UPSERT, {
        ...imported,
        is_owned: owned ? 1 : 0,
        is_wanted: owned ? 0 : 1,
        condition: owned ? condition : 'open_complete',
        acquired_price: owned && price ? parseFloat(price) : null,
      })
      toast.success(owned ? 'Added to collection!' : 'Added to wishlist!')
      setExpanding(null)
      setPrice('')
      onAdded()
    } catch (err) { toast.error(String(err)) }
    finally { setAdding(null) }
  }

  const handleClose = () => { setQuery(''); setResults([]); setExpanding(null); onClose() }

  return (
    <Dialog open={open} onClose={handleClose} title="Add Set to Collection" wide>
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-surface-muted)]" />
          <input
            autoFocus
            className="w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] pl-9 pr-3 py-2.5 text-sm outline-none placeholder:text-[var(--color-surface-muted)] focus:border-[var(--color-accent)] transition-colors"
            placeholder="Search by name or set number…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          {searching && <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />}
        </div>

        {results.length === 0 && !query.trim() && (
          <p className="text-sm text-center text-[var(--color-surface-muted)] py-4">Type to search Rebrickable</p>
        )}
        {results.length === 0 && query.trim() && !searching && (
          <p className="text-sm text-center text-[var(--color-surface-muted)] py-4">No results found</p>
        )}

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {results.map((r) => (
            <div key={r.set_num} className="rounded-xl border border-[var(--color-surface-border)] overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                {r.set_img_url
                  ? <img src={r.set_img_url} alt={r.name} className="w-14 h-14 object-contain rounded bg-[var(--color-surface-overlay)] shrink-0" />
                  : <div className="w-14 h-14 rounded bg-[var(--color-surface-overlay)] flex items-center justify-center shrink-0"><Package className="h-6 w-6 text-[var(--color-surface-muted)]" /></div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-[var(--color-accent)]">#{r.set_num}</p>
                  <p className="text-sm font-semibold leading-tight truncate">{r.name}</p>
                  <p className="text-xs text-[var(--color-surface-muted)]">{r.year} · {r.num_parts} pcs</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" onClick={() => setExpanding(expanding === r.set_num ? null : r.set_num)} disabled={!!adding}>
                    {adding === r.set_num ? <Spinner size="sm" /> : <Plus className="h-3.5 w-3.5" />}Own
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => addSet(r, false)} disabled={!!adding}>Wishlist</Button>
                </div>
              </div>

              {expanding === r.set_num && (
                <div className="border-t border-[var(--color-surface-border)] px-3 py-3 bg-[var(--color-surface-overlay)] space-y-3">
                  <div className="flex gap-2">
                    {(['sealed', 'open_complete', 'open_incomplete'] as const).map((c) => (
                      <button key={c} onClick={() => setCondition(c)}
                        className={cn(
                          'flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors',
                          condition === c
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15'
                            : 'border-[var(--color-surface-border)] text-[var(--color-surface-muted)] hover:border-[var(--color-surface-muted)]',
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
                    <Button size="sm" onClick={() => addSet(r, true)} disabled={!!adding}>
                      {adding === r.set_num ? <Spinner size="sm" /> : null}Confirm
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setExpanding(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

// ── Add Fig Dialog ─────────────────────────────────────────────────────────────

function AddFigDialog({ open, onClose, onAdded }: {
  open: boolean; onClose: () => void; onAdded: () => void
}) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<RebrickableFigResult[]>([])
  const [searching, setSearching] = useState(false)
  const [ownedFigNums, setOwnedFigNums] = useState<Set<string>>(new Set())
  const [expanding, setExpanding] = useState<string | null>(null)
  const [condition, setCondition] = useState<'new' | 'used' | 'cracked'>('used')
  const [price, setPrice]     = useState('')
  const [adding, setAdding]   = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    window.ipc.invoke(IPC.FIGS_LIST, { is_owned: 1 })
      .then((r) => {
        const all = r as { fig_number: string }[]
        setOwnedFigNums(new Set(all.map((f) => f.fig_number)))
      })
      .catch(() => {})
  }, [open])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const res = await window.ipc.invoke(IPC.CATALOG_BROWSE_MINIFIGS, { search: q, page: 1, page_size: 20 }) as { results: RebrickableFigResult[] }
      setResults(res.results ?? [])
    } catch { setResults([]) }
    finally { setSearching(false) }
  }, [])

  const handleQueryChange = (q: string) => {
    setQuery(q)
    clearTimeout((handleQueryChange as unknown as { t?: ReturnType<typeof setTimeout> }).t)
    ;(handleQueryChange as unknown as { t?: ReturnType<typeof setTimeout> }).t = setTimeout(() => search(q), 400)
  }

  const addFig = async (
    r: RebrickableFigResult, owned: boolean,
    cond?: 'new' | 'used' | 'cracked', pricePaid?: number | null,
  ) => {
    setAdding(r.set_num)
    try {
      await window.ipc.invoke(IPC.CATALOG_ADD_FIG, {
        set_num: r.set_num, name: r.name, set_img_url: r.set_img_url,
        is_owned: owned ? 1 : 0, is_wanted: owned ? 0 : 1,
        condition: cond,
        acquired_price: pricePaid ?? null,
      })
      toast.success(owned ? `Added ${r.name}` : `Added ${r.name} to wishlist`)
      if (owned) setOwnedFigNums((s) => new Set([...s, r.set_num]))
      setExpanding(null)
      setPrice('')
      onAdded()
    } catch (err) { toast.error(String(err)) }
    finally { setAdding(null) }
  }

  const handleClose = () => { setQuery(''); setResults([]); setExpanding(null); onClose() }

  return (
    <Dialog open={open} onClose={handleClose} title="Add Minifigure to Collection" wide>
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-surface-muted)]" />
          <input
            autoFocus
            className="w-full rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-overlay)] pl-9 pr-3 py-2.5 text-sm outline-none placeholder:text-[var(--color-surface-muted)] focus:border-[var(--color-accent)] transition-colors"
            placeholder="Search by name or fig number…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          {searching && <Spinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />}
        </div>

        {results.length === 0 && !query.trim() && (
          <p className="text-sm text-center text-[var(--color-surface-muted)] py-4">Type a name or fig number to search</p>
        )}
        {results.length === 0 && query.trim() && !searching && (
          <p className="text-sm text-center text-[var(--color-surface-muted)] py-4">No results found</p>
        )}

        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {results.map((r) => {
            const isOwned = ownedFigNums.has(r.set_num)
            const busy    = adding === r.set_num
            return (
              <div key={r.set_num} className={cn(
                'rounded-xl border overflow-hidden transition-colors',
                isOwned ? 'border-green-500/40' : 'border-[var(--color-surface-border)]',
              )}>
                <div className="flex items-center gap-3 p-3">
                  {r.set_img_url
                    ? <img src={r.set_img_url} alt={r.name} className="w-14 h-14 object-contain rounded bg-[var(--color-surface-overlay)] shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    : <div className="w-14 h-14 rounded bg-[var(--color-surface-overlay)] flex items-center justify-center shrink-0"><User className="h-6 w-6 text-[var(--color-surface-muted)]" /></div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-[var(--color-accent)]">{r.set_num}</p>
                    <p className="text-sm font-semibold leading-tight truncate">{r.name}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {isOwned ? (
                      <span className="flex items-center gap-1 text-xs text-green-400 font-semibold px-2 py-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />Owned
                      </span>
                    ) : (
                      <>
                        <Button size="sm" onClick={() => setExpanding(expanding === r.set_num ? null : r.set_num)} disabled={busy}>
                          {busy ? <Spinner size="sm" /> : <Plus className="h-3.5 w-3.5" />}Own
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => addFig(r, false)} disabled={busy}>Wishlist</Button>
                      </>
                    )}
                  </div>
                </div>
                {expanding === r.set_num && !isOwned && (
                  <div className="border-t border-[var(--color-surface-border)] px-3 py-3 bg-[var(--color-surface-overlay)] space-y-3">
                    <div className="flex gap-2">
                      {(['new', 'used', 'cracked'] as const).map((c) => (
                        <button key={c} onClick={() => setCondition(c)}
                          className={cn(
                            'flex-1 py-1.5 rounded-lg border text-xs font-semibold capitalize transition-colors',
                            condition === c
                              ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15'
                              : 'border-[var(--color-surface-border)] text-[var(--color-surface-muted)] hover:border-[var(--color-surface-muted)]',
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
                      <Button size="sm" onClick={() => addFig(r, true, condition, price ? parseFloat(price) : null)} disabled={busy}>
                        {busy ? <Spinner size="sm" /> : null}Confirm
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setExpanding(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Collection() {
  const [typeTab, setTypeTab]           = useState<TypeTab>('sets')
  const [ownershipTab, setOwnershipTab] = useState<OwnershipTab>('owned')
  const [search, setSearch]             = useState('')
  const [addOpen, setAddOpen]           = useState(false)
  const [addFigOpen, setAddFigOpen]     = useState(false)
  const [detailSet, setDetailSet]       = useState<LegoSetDetail | null>(null)
  const [detailFig, setDetailFig]       = useState<MinifigDetail | null>(null)

  const [stats, setStats]           = useState<PortfolioStats | null>(null)
  const [priceMap, setPriceMap]     = useState<PriceMap>({})
  const [figPriceMap, setFigPriceMap] = useState<PriceMap>({})
  const [refreshing, setRefreshing] = useState(false)

  const setFilter = ownershipTab === 'owned' ? { is_owned: 1 as const } : ownershipTab === 'wanted' ? { is_wanted: 1 as const } : {}
  const figFilter = ownershipTab === 'owned' ? { is_owned: 1 as const } : ownershipTab === 'wanted' ? { is_wanted: 1 as const } : {}

  const { data: sets = [], isLoading: setsLoading, refetch: refetchSets } = useSets(setFilter) as { data: unknown[]; isLoading: boolean; refetch: () => void }
  const { data: figs = [], isLoading: figsLoading, refetch: refetchFigs } = useMinifigures(figFilter) as { data: unknown[]; isLoading: boolean; refetch: () => void }

  // ── Load portfolio stats ─────────────────────────────────────────────────
  const loadStats = useCallback(() => {
    window.ipc.invoke(IPC.PRICE_PORTFOLIO_STATS)
      .then((r) => setStats(r as PortfolioStats))
      .catch(() => {})
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  // ── Load cached prices when owned sets change ────────────────────────────
  useEffect(() => {
    const owned = (sets as { set_number: string; is_owned: number }[]).filter((s) => s.is_owned)
    if (!owned.length) { setPriceMap({}); return }
    const nums = owned.map((s) => s.set_number)
    window.ipc.invoke(IPC.PRICE_GET_BULK, nums)
      .then((r) => setPriceMap(r as PriceMap))
      .catch(() => {})
  }, [sets])

  // ── Load cached prices when owned figs change ────────────────────────────
  useEffect(() => {
    const owned = (figs as { fig_number: string; is_owned: number }[]).filter((f) => f.is_owned)
    if (!owned.length) { setFigPriceMap({}); return }
    const nums = owned.map((f) => f.fig_number)
    window.ipc.invoke(IPC.PRICE_GET_BULK_FIGS, nums)
      .then((r) => setFigPriceMap(r as PriceMap))
      .catch(() => {})
  }, [figs])

  // ── Refresh BrickLink prices (sets + figs) ───────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const [setRes, figRes] = await Promise.all([
        window.ipc.invoke(IPC.PRICE_REFRESH_COLLECTION) as Promise<{ refreshed: number; total: number; errors?: string[] }>,
        window.ipc.invoke(IPC.PRICE_REFRESH_FIGS)       as Promise<{ refreshed: number; total: number; errors?: string[] }>,
      ])
      const totalRefreshed = setRes.refreshed + figRes.refreshed
      const allErrors = [...(setRes.errors ?? []), ...(figRes.errors ?? [])]
      if (totalRefreshed > 0) {
        toast.success(`Updated ${totalRefreshed} prices (${setRes.refreshed} sets, ${figRes.refreshed} figs)`)
      }
      if (allErrors.length > 0 && totalRefreshed === 0) {
        toast.error(`Price refresh failed: ${allErrors[0]}`)
      } else if (allErrors.length > 0) {
        toast.error(`${allErrors.length} item(s) failed: ${allErrors[0]}`)
      } else if (totalRefreshed === 0) {
        toast(`No prices updated — collection may be empty`, { icon: 'ℹ️' })
      }
      const setNums = (sets as { set_number: string; is_owned: number }[]).filter((s) => s.is_owned).map((s) => s.set_number)
      const figNums = (figs as { fig_number: string; is_owned: number }[]).filter((f) => f.is_owned).map((f) => f.fig_number)
      const [setMap, figMap] = await Promise.all([
        window.ipc.invoke(IPC.PRICE_GET_BULK, setNums)      as Promise<PriceMap>,
        window.ipc.invoke(IPC.PRICE_GET_BULK_FIGS, figNums) as Promise<PriceMap>,
      ])
      setPriceMap(setMap)
      setFigPriceMap(figMap)
      loadStats()
    } catch (err) {
      const msg = String(err)
      if (msg.includes('No handler registered') || msg.includes('no handler')) {
        toast.error('Price refresh unavailable — please restart the app')
      } else if (msg.includes('BrickLink credentials')) {
        toast.error('BrickLink API keys not configured — add them in Settings')
      } else {
        toast.error(`Price refresh failed: ${msg.replace(/^Error:\s*/i, '')}`)
      }
    }
    finally { setRefreshing(false) }
  }

  const handleAdded = useCallback(() => { refetchSets(); refetchFigs() }, [refetchSets, refetchFigs])

  const filteredSets = search
    ? (sets as { name: string; set_number: string }[]).filter(
        (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.set_number.includes(search)
      )
    : sets

  const filteredFigs = search
    ? (figs as { name: string; fig_number: string }[]).filter(
        (f) => f.name.toLowerCase().includes(search.toLowerCase()) || f.fig_number.includes(search)
      )
    : figs

  const isLoading = typeTab === 'sets' ? setsLoading : figsLoading

  // ── Gain/loss calculations ───────────────────────────────────────────────
  const totalMarket   = stats ? stats.used_value + stats.fig_used_value : 0
  const totalInvested = stats ? stats.acquired_total + stats.fig_acquired_total : 0
  const gainLoss      = totalMarket - totalInvested
  const gainTrend     = gainLoss > 0 ? 'up' : gainLoss < 0 ? 'down' : 'flat'
  const gainPct       = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : null
  const hasFinancial  = !!(stats && totalInvested > 0 && totalMarket > 0)

  const gainLossDisplay = hasFinancial
    ? `${gainLoss >= 0 ? '+' : ''}${formatCurrency(gainLoss)}${gainPct != null ? ` (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)` : ''}`
    : '—'
  const gainLossSub = hasFinancial
    ? `vs. ${formatCurrency(totalInvested)} invested`
    : stats && totalInvested > 0 ? 'Refresh prices to calculate' : 'Add purchase prices to track'

  return (
    <PageShell
      title="Collection"
      subtitle="Your LEGO sets and minifigures"
      actions={
        <div className="flex gap-2">
          {ownershipTab === 'owned' && (
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing…' : 'Refresh Prices'}
            </Button>
          )}
          {typeTab === 'sets'
            ? <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Add Set</Button>
            : <Button size="sm" onClick={() => setAddFigOpen(true)}><Plus className="h-4 w-4" />Add Minifigure</Button>
          }
        </div>
      }
    >
      <div className="p-6">

        {/* ── Portfolio stats ── */}
        {stats && ownershipTab === 'owned' && (
          <div className="mb-6 space-y-3">
            {/* Row 1 — Collection size */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Sets Owned"
                value={stats.set_count.toString()}
                sub={`${stats.wanted_count} on wishlist`}
              />
              <StatCard
                label="Minifigures"
                value={stats.minifig_count.toString()}
                sub="owned across collection"
              />
              <StatCard
                label="Price Coverage"
                value={`${stats.priced_count + stats.fig_priced_count} / ${stats.set_count + stats.fig_priced_count}`}
                sub="items with market data"
              />
            </div>
            {/* Row 2 — Market values */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Set Value"
                value={stats.used_value > 0 ? formatCurrency(stats.used_value) : '—'}
                sub={stats.new_value > 0 ? `Sealed: ${formatCurrency(stats.new_value)}` : 'Used avg (BrickLink)'}
              />
              <StatCard
                label="Fig Value"
                value={stats.fig_used_value > 0 ? formatCurrency(stats.fig_used_value) : '—'}
                sub={stats.fig_new_value > 0 ? `New: ${formatCurrency(stats.fig_new_value)}` : 'Used avg (BrickLink)'}
              />
              <StatCard
                label="Combined Value"
                value={totalMarket > 0 ? formatCurrency(totalMarket) : '—'}
                sub="sets + minifigures"
              />
            </div>
            {/* Row 3 — Financial */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Total Invested"
                value={totalInvested > 0 ? formatCurrency(totalInvested) : '—'}
                sub={stats.retail_total > 0 ? `MSRP: ${formatCurrency(stats.retail_total)}` : 'Add purchase prices to track'}
              />
              <StatCard
                label="Gain / Loss"
                value={gainLossDisplay}
                sub={gainLossSub}
                trend={hasFinancial ? gainTrend : undefined}
              />
              <StatCard
                label="Wishlist"
                value={stats.wanted_count.toString()}
                sub="sets to acquire"
              />
            </div>
          </div>
        )}

        {/* ── Type tabs ── */}
        <div className="flex gap-1 bg-[var(--color-surface-overlay)] rounded-lg p-1 w-fit mb-3">
          {(['sets', 'minifigs'] as TypeTab[]).map((t) => (
            <button key={t} onClick={() => { setTypeTab(t); setSearch('') }}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-semibold font-display capitalize transition-colors',
                typeTab === t ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'hover:bg-[var(--color-surface-muted)]',
              )}>
              {t === 'sets' ? 'Sets' : 'Minifigures'}
            </button>
          ))}
        </div>

        {/* ── Ownership filter ── */}
        <div className="flex gap-1 mb-4">
          {(['owned', 'wanted', 'all'] as OwnershipTab[]).map((t) => (
            <button key={t} onClick={() => setOwnershipTab(t)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors border',
                ownershipTab === t
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-current'
                  : 'border-[var(--color-surface-border)] text-[var(--color-surface-muted)] hover:border-[var(--color-surface-muted)]',
              )}>
              {t}
            </button>
          ))}
        </div>

        <div className="mb-4 max-w-sm">
          <Input
            placeholder={`Search ${typeTab === 'sets' ? 'sets' : 'minifigures'}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : typeTab === 'sets' ? (
          filteredSets.length === 0 ? (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="No sets yet"
              description="Use the Browse page to find sets, or click Add Set to search."
              action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Add Set</Button>}
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {(filteredSets as LegoSetDetail[]).map((set) => {
                const prices      = priceMap[set.set_number]
                const marketPrice = (set.condition === 'sealed' || set.condition === 'new')
                  ? prices?.new
                  : prices?.used
                return (
                  <SetCard
                    key={set.set_number}
                    set={set}
                    marketPrice={marketPrice ?? null}
                    onClick={() => setDetailSet(set)}
                  />
                )
              })}
            </div>
          )
        ) : (
          filteredFigs.length === 0 ? (
            <EmptyState
              icon={<User className="h-8 w-8" />}
              title="No minifigures yet"
              description="Browse the catalog to find and add minifigures to your collection."
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {(filteredFigs as MinifigDetail[]).map((fig) => {
                const prices      = figPriceMap[fig.fig_number]
                const marketPrice = fig.condition === 'new' ? prices?.new : prices?.used
                return (
                  <MinifigCard
                    key={fig.fig_number}
                    fig={fig}
                    marketPrice={marketPrice ?? null}
                    onClick={() => setDetailFig(fig)}
                  />
                )
              })}
            </div>
          )
        )}
      </div>

      <AddSetDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={handleAdded} />
      <AddFigDialog open={addFigOpen} onClose={() => setAddFigOpen(false)} onAdded={handleAdded} />

      <SetDetailDialog
        set={detailSet}
        marketPrice={detailSet ? (
          (detailSet.condition === 'sealed' || detailSet.condition === 'new')
            ? priceMap[detailSet.set_number]?.new
            : priceMap[detailSet.set_number]?.used
        ) ?? null : null}
        open={!!detailSet}
        onClose={() => setDetailSet(null)}
        onDeleted={() => { setDetailSet(null); refetchSets() }}
      />
      <FigDetailDialog
        fig={detailFig}
        marketPrices={detailFig ? figPriceMap[detailFig.fig_number] : undefined}
        open={!!detailFig}
        onClose={() => setDetailFig(null)}
        onDeleted={() => { setDetailFig(null); refetchFigs() }}
      />
    </PageShell>
  )
}
