import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownUp, Check, FileDown, FileUp, LayoutGrid, List, Plus, SlidersHorizontal, X, Heart } from 'lucide-react'
import { api } from '@/lib/api'
import { useSets, useFigs, useSummary, useThemes, useTags } from '@/lib/queries'
import { useUi } from '@/lib/ui-store'
import { toast } from '@/lib/toast'
import { formatMoney, formatNumber } from '@/lib/formatters'
import { SET_CONDITION_LABEL, FIG_CONDITION_LABEL } from '@/lib/conditions'
import type { CollectionQuery, CollectionSort, EntityKind } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useDebounced } from '@/hooks/useDebounced'
import { Page, Rise } from '@/components/shell/Page'
import { Button, IconButton } from '@/components/ui/Button'
import { SearchInput, Select } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { Menu, MenuCheck, MenuLabel, MenuItem, MenuSeparator } from '@/components/ui/Menu'
import { Delta, Empty, ItemImage, Chip } from '@/components/ui/Bits'
import { ItemCard, itemNumber, itemLabelNumber, type CollectionItem } from '@/components/collection/ItemCard'
import { BulkBar } from '@/components/collection/BulkBar'
import { ImportDialog } from '@/components/collection/ImportDialog'
import { SceneBuild, SceneSearch } from '@/components/brick/Scenes'

const SORTS: { value: CollectionSort; label: string }[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'value', label: 'Value' },
  { value: 'gain', label: 'Gain' },
  { value: 'name', label: 'Name' },
  { value: 'number', label: 'Number' },
  { value: 'year', label: 'Year' },
  { value: 'theme', label: 'Theme' },
  { value: 'paid', label: 'Price paid' },
]

export default function Collection() {
  const [params, setParams] = useSearchParams()
  const openAdd = useUi((s) => s.openAdd)
  const openSheet = useUi((s) => s.openSheet)
  const kind: EntityKind = params.get('tab') === 'minifigs' ? 'minifig' : 'set'
  const scope = params.get('scope') === 'wanted' ? 'wanted' : 'owned'
  const view = params.get('view') === 'list' ? 'list' : 'grid'
  const [search, setSearch] = useState('')
  const [theme, setTheme] = useState('')
  const [condition, setCondition] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<CollectionSort>('added')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [importOpen, setImportOpen] = useState(params.get('import') === '1')
  const [selected, setSelected] = useState<number[]>([])
  const lastClicked = useRef<number | null>(null)
  const q = useDebounced(search, 200)

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v) }
    setParams(next, { replace: true })
  }
  useEffect(() => { if (params.get('import') === '1') { setImportOpen(true); set({ import: null }) } }, [params])
  useEffect(() => { setSelected([]); setTheme(''); setCondition(''); setTag('') }, [kind, scope])

  const query: CollectionQuery = { scope, search: q || undefined, theme: theme || undefined, condition: condition || undefined, tag: tag || undefined, sort, dir }
  const sets = useSets(kind === 'set' ? query : { scope })
  const figs = useFigs(kind === 'minifig' ? query : { scope })
  const ownedSets = useSets({ scope: 'owned' })
  const ownedFigs = useFigs({ scope: 'owned' })
  const wantedSets = useSets({ scope: 'wanted' })
  const wantedFigs = useFigs({ scope: 'wanted' })
  const { data: summary } = useSummary()
  const { data: themes } = useThemes()
  const { data: tags } = useTags()
  const items: CollectionItem[] = (kind === 'set' ? sets.data : figs.data) ?? []
  const loading = (kind === 'set' ? sets : figs).isLoading
  const filtered = !!(q || theme || condition || tag)

  const toggle = useCallback((id: number, shift: boolean) => {
    setSelected((cur) => {
      if (shift && lastClicked.current != null) {
        const a = items.findIndex((i) => i.id === lastClicked.current)
        const b = items.findIndex((i) => i.id === id)
        if (a !== -1 && b !== -1) {
          const range = items.slice(Math.min(a, b), Math.max(a, b) + 1).map((i) => i.id)
          return [...new Set([...cur, ...range])]
        }
      }
      lastClicked.current = id
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    })
  }, [items])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input,textarea,select')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && items.length) { e.preventDefault(); setSelected(items.map((i) => i.id)) }
      if (e.key === 'Escape') setSelected([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items])

  const exportCsv = async () => {
    try {
      const r = await api.data.exportCsv()
      if (!r.canceled) toast.success('Exported your collection', { body: `${r.sets} sets and ${r.figs} minifigures → ${r.fileName}` })
    } catch (err) { toast.error(err, "Couldn't export") }
  }

  const themeList = kind === 'set' ? themes?.sets : themes?.figs
  const conditions = kind === 'set' ? Object.entries(SET_CONDITION_LABEL) : Object.entries(FIG_CONDITION_LABEL)
  const visibleValue = items.reduce((n, i) => n + (i.market_price ?? 0) * i.quantity, 0)

  return (
    <Page
      wide
      title="Collection"
      sub={summary && (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="tnum font-mono text-[14px] font-semibold text-fg">{formatMoney(summary.total_value)}</span>
          {summary.gain != null && <Delta value={summary.gain} pct={summary.gain_pct} />}
          <span>{formatNumber(summary.sets_owned)} sets · {formatNumber(summary.figs_owned)} minifigures · {formatNumber(summary.wanted_count)} on your wishlist</span>
        </span>
      )}
      actions={
        <>
          <Menu trigger={<Button variant="ghost" icon={<FileUp className="size-4" />}>Import / export</Button>}>
            <MenuItem icon={<FileUp />} onSelect={() => setImportOpen(true)}>Import a file or photo</MenuItem>
            <MenuItem icon={<FileDown />} onSelect={exportCsv}>Export everything to CSV</MenuItem>
          </Menu>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openAdd({ kind, as: scope })}>Add</Button>
        </>
      }
    >
      <Rise className="sticky top-0 z-10 -mx-8 mb-5 flex flex-wrap items-center gap-2 border-b border-transparent bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] px-8 py-2.5 backdrop-blur-xl">
        <Segmented label="Kind" value={kind} onChange={(k) => set({ tab: k === 'minifig' ? 'minifigs' : null })}
          options={[
            { value: 'set', label: 'Sets', count: (scope === 'owned' ? ownedSets.data : wantedSets.data)?.length },
            { value: 'minifig', label: 'Minifigures', count: (scope === 'owned' ? ownedFigs.data : wantedFigs.data)?.length },
          ]} />
        <Segmented label="Owned or wishlist" value={scope} onChange={(s) => set({ scope: s === 'wanted' ? 'wanted' : null })}
          options={[
            { value: 'owned', label: 'Owned' },
            { value: 'wanted', label: <span className="inline-flex items-center gap-1"><Heart className="size-3.5" />Wishlist</span>, count: (wantedSets.data?.length ?? 0) + (wantedFigs.data?.length ?? 0) || undefined },
          ]} />
        <div className="flex-1" />
        <SearchInput value={search} onChange={setSearch} placeholder={kind === 'set' ? 'Search name, number, theme' : 'Search name, number, character'} className="w-[260px]" />
        <Menu trigger={
          <Button variant={theme || condition || tag ? 'secondary' : 'ghost'} icon={<SlidersHorizontal className="size-4" />}>
            Filter{[theme, condition, tag].filter(Boolean).length ? ` · ${[theme, condition, tag].filter(Boolean).length}` : ''}
          </Button>
        }>
          <MenuLabel>Theme</MenuLabel>
          <div className="px-1.5 pb-1"><Select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme"><option value="">All themes</option>{themeList?.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
          <MenuLabel>Condition</MenuLabel>
          {conditions.map(([v, l]) => <MenuCheck key={v} checked={condition === v} onSelect={() => setCondition(condition === v ? '' : v)}>{l}</MenuCheck>)}
          {!!tags?.length && <><MenuLabel>Tag</MenuLabel>{tags.map((t) => <MenuCheck key={t.id} checked={tag === t.name} onSelect={() => setTag(tag === t.name ? '' : t.name)}>{t.name}</MenuCheck>)}</>}
          {(theme || condition || tag) && <><MenuSeparator /><MenuItem icon={<X />} onSelect={() => { setTheme(''); setCondition(''); setTag('') }}>Clear filters</MenuItem></>}
        </Menu>
        <Menu trigger={<Button variant="ghost" icon={<ArrowDownUp className="size-4" />}>{SORTS.find((s) => s.value === sort)?.label}</Button>}>
          <MenuLabel>Sort by</MenuLabel>
          {SORTS.map((s) => <MenuCheck key={s.value} checked={sort === s.value} onSelect={() => setSort(s.value)}>{s.label}</MenuCheck>)}
          <MenuSeparator />
          <MenuCheck checked={dir === 'desc'} onSelect={() => setDir('desc')}>Descending</MenuCheck>
          <MenuCheck checked={dir === 'asc'} onSelect={() => setDir('asc')}>Ascending</MenuCheck>
        </Menu>
        <div className="flex rounded-[11px] border border-line bg-panel-2 p-[3px]">
          <IconButton label="Grid view" size="sm" tone={view === 'grid' ? 'active' : 'default'} onClick={() => set({ view: null })}><LayoutGrid className="size-4" /></IconButton>
          <IconButton label="List view" size="sm" tone={view === 'list' ? 'active' : 'default'} onClick={() => set({ view: 'list' })}><List className="size-4" /></IconButton>
        </div>
      </Rise>

      {filtered && items.length > 0 && (
        <p className="-mt-2 mb-4 text-[12.5px] text-fg-3">{items.length} match{items.length === 1 ? '' : 'es'} · worth {formatMoney(visibleValue)}</p>
      )}

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton h-[300px] !rounded-[18px]" />)}</div>
      ) : items.length === 0 ? (
        filtered ? (
          <Empty scene={<SceneSearch />} title="Nothing matches those filters" actions={<Button onClick={() => { setSearch(''); setTheme(''); setCondition(''); setTag('') }}>Clear filters</Button>} />
        ) : (
          <Empty scene={<SceneBuild />} title={scope === 'wanted' ? 'Your wishlist is empty' : kind === 'set' ? 'No sets yet' : 'No minifigures yet'}
            actions={<>
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openAdd({ kind, as: scope })}>{scope === 'wanted' ? 'Add to wishlist' : `Add ${kind === 'set' ? 'a set' : 'a minifigure'}`}</Button>
              {scope === 'owned' && <Button icon={<FileUp className="size-4" />} onClick={() => setImportOpen(true)}>Import</Button>}
            </>}>
            {scope === 'wanted' ? 'Keep track of what you want next. Set a price alert on anything here and BrickForge will tell you when it drops.' : 'Search the catalog, scan photos, or import a list you already keep.'}
          </Empty>
        )
      ) : view === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
          {items.map((item, i) => (
            <ItemCard key={item.id} item={item} index={i} selected={selected.includes(item.id)} selecting={selected.length > 0}
              onOpen={() => openSheet(kind, itemNumber(item))} onToggle={(shift) => toggle(item.id, shift)} />
          ))}
        </div>
      ) : (
        <ListView items={items} kind={kind} selected={selected} onToggle={toggle} onOpen={(i) => openSheet(kind, itemNumber(i))}
          sort={sort} dir={dir} onSort={(s) => { if (s === sort) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(s); setDir('desc') } }} />
      )}

      <BulkBar kind={kind} scope={scope} ids={selected} numbers={items.filter((i) => selected.includes(i.id)).map(itemNumber)} onClear={() => setSelected([])} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </Page>
  )
}

function ListView({ items, kind, selected, onToggle, onOpen, sort, dir, onSort }: {
  items: CollectionItem[]
  kind: EntityKind
  selected: number[]
  onToggle: (id: number, shift: boolean) => void
  onOpen: (i: CollectionItem) => void
  sort: CollectionSort
  dir: 'asc' | 'desc'
  onSort: (s: CollectionSort) => void
}) {
  const head = (label: string, s?: CollectionSort, cls = '') => (
    <th className={cn('px-3 py-2.5 font-medium text-fg-3', cls)}>
      {s ? (
        <button type="button" onClick={() => onSort(s)} className={cn('inline-flex items-center gap-1 hover:text-fg', sort === s && 'text-fg')}>
          {label}{sort === s && <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
        </button>
      ) : label}
    </th>
  )
  const labels = kind === 'set' ? SET_CONDITION_LABEL : FIG_CONDITION_LABEL
  return (
    <div className="panel overflow-hidden !rounded-[18px]">
      <table className="w-full text-[13px]">
        <thead className="border-b border-line bg-panel-2/70 text-left">
          <tr>
            <th className="w-10 px-3" />
            {head('Item', 'name')}
            {head('Theme', 'theme', 'w-[160px]')}
            {head('Year', 'year', 'w-[70px]')}
            {head('Condition', undefined, 'w-[150px]')}
            {head('Qty', undefined, 'w-[56px] text-right')}
            {head('Paid', 'paid', 'w-[100px] text-right')}
            {head('Value', 'value', 'w-[110px] text-right')}
            {head('Gain', 'gain', 'w-[150px] text-right')}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const sel = selected.includes(i.id)
            const gain = i.market_price != null && i.acquired_price != null ? (i.market_price - i.acquired_price) * i.quantity : null
            return (
              <tr key={i.id} onClick={(e) => (e.ctrlKey || e.metaKey || e.shiftKey || selected.length ? onToggle(i.id, e.shiftKey) : onOpen(i))}
                className={cn('cursor-pointer border-b border-line last:border-0 hover:bg-hover', sel && 'bg-accent-soft hover:bg-accent-soft')}>
                <td className="px-3" onClick={(e) => { e.stopPropagation(); onToggle(i.id, e.shiftKey) }}>
                  <span className={cn('grid size-5 place-items-center rounded-[6px] border-2', sel ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')}>{sel && <Check className="size-3" strokeWidth={3} />}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <ItemImage src={i.image_url} alt="" className="size-10 shrink-0 rounded-[9px]" pad="p-0.5" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{i.name}</div>
                      <div className="flex items-center gap-2 font-mono text-[11.5px] text-fg-3">{itemLabelNumber(i)}{!i.is_owned && i.is_wanted ? <Chip tone="accent">Wishlist</Chip> : null}</div>
                    </div>
                  </div>
                </td>
                <td className="truncate px-3 text-fg-2">{i.theme ?? <span className="text-fg-4">—</span>}</td>
                <td className="tnum px-3 text-fg-2">{i.year ?? '—'}</td>
                <td className="px-3 text-fg-2">{labels[i.condition as keyof typeof labels]}</td>
                <td className="tnum px-3 text-right font-mono">{i.quantity}</td>
                <td className="tnum px-3 text-right font-mono text-fg-2">{formatMoney(i.acquired_price)}</td>
                <td className="tnum px-3 text-right font-mono font-semibold">{formatMoney(i.market_price != null ? i.market_price * i.quantity : null)}</td>
                <td className="px-3 text-right"><Delta value={gain} pct={gain != null && i.acquired_price ? ((i.market_price! - i.acquired_price) / i.acquired_price) * 100 : null} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
