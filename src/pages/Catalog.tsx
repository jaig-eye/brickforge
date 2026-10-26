import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Heart, Plus, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { useOwnership, useSettings } from '@/lib/queries'
import { useDebounced } from '@/hooks/useDebounced'
import { useAddItem } from '@/hooks/useAddItem'
import { formatMoney, formatNumber } from '@/lib/formatters'
import type { CatalogFig, CatalogSet, EntityKind } from '@/lib/types'
import { Page, Rise } from '@/components/shell/Page'
import { Button, IconButton } from '@/components/ui/Button'
import { SearchInput, Select } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { Switch, Tip } from '@/components/ui/Menu'
import { Chip, Empty, ItemImage, Spinner } from '@/components/ui/Bits'
import { Sheet } from '@/components/ui/Overlay'
import { SceneKey, SceneSearch } from '@/components/brick/Scenes'

const ORDER = [
  { value: '-year', label: 'Newest first' },
  { value: 'year', label: 'Oldest first' },
  { value: 'name', label: 'Name' },
  { value: '-num_parts', label: 'Most pieces' },
]

export default function Catalog() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [kind, setKind] = useState<EntityKind>('set')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [themeId, setThemeId] = useState<number | null>(null)
  const [ordering, setOrdering] = useState('-year')
  const [setsOnly, setSetsOnly] = useState(true)
  const [hideOwned, setHideOwned] = useState(false)
  const [detail, setDetail] = useState<CatalogSet | null>(null)
  const q = useDebounced(search.trim(), 350)
  const { data: settings } = useSettings()
  const { data: owned } = useOwnership()
  const { addSet, addFig } = useAddItem()
  useEffect(() => { const p = params.get('q'); if (p) setSearch(p) }, [params])

  const themes = useQuery({ queryKey: ['catalog', 'themes'], queryFn: api.catalog.themes, staleTime: Infinity, enabled: !!settings?.keys.rebrickable.set })
  const roots = useMemo(() => (themes.data ?? []).filter((t) => t.parent_id == null), [themes.data])

  const results = useInfiniteQuery({
    queryKey: ['catalog', kind, q, themeId, ordering, setsOnly],
    enabled: !!settings?.keys.rebrickable.set,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => (kind === 'set'
      ? api.catalog.sets({ search: q, theme_id: themeId, page: pageParam, ordering, setsOnly })
      : api.catalog.figs({ search: q, theme_id: themeId, page: pageParam })) as Promise<{ count: number; results: (CatalogSet | CatalogFig)[] }>,
    getNextPageParam: (last, all) => (all.reduce((n, p) => n + p.results.length, 0) < last.count ? all.length + 1 : undefined),
    staleTime: 5 * 60_000,
  })

  const isOwned = (n: string) => owned?.owned.includes(n) ?? false
  const isWanted = (n: string) => owned?.wanted.includes(n) ?? false
  const items = (results.data?.pages.flatMap((p) => p.results) ?? []).filter((i) => !hideOwned || !isOwned(i.set_num))
  const total = results.data?.pages[0]?.count ?? 0
  const keyMissing = settings && !settings.keys.rebrickable.set
  const keyRejected = results.error instanceof AppError && results.error.code === 'auth'

  const add = (item: CatalogSet | CatalogFig, wanted: boolean, el: Element | null) => {
    const opts = { as: wanted ? 'wanted' as const : 'owned' as const, condition: kind === 'set' ? 'sealed' : 'used' }
    if (kind === 'set') void addSet(item.set_num, opts, { el, image: item.set_img_url })
    else void addFig({ set_num: item.set_num, name: item.name, set_img_url: item.set_img_url }, opts, { el })
  }

  return (
    <Page wide title="Catalog" sub={keyMissing ? 'Every LEGO set and minifigure, from Rebrickable.' : total ? `${formatNumber(total)} ${kind === 'set' ? 'sets' : 'minifigures'}${q ? ` matching “${q}”` : ''}` : 'Every LEGO set and minifigure, from Rebrickable.'}>
      {keyMissing || keyRejected ? (
        <Empty scene={<SceneKey />} title={keyRejected ? 'Rebrickable rejected the key' : 'Connect the catalog'}
          actions={<Button variant="primary" onClick={() => navigate('/settings#connections')}>Add a Rebrickable key</Button>}>
          Browsing and searching use Rebrickable's free catalog. Create a free account, generate an API key, and paste it in Settings. It takes about a minute.
        </Empty>
      ) : (
        <>
          <Rise className="sticky top-0 z-10 -mx-8 mb-5 flex flex-wrap items-center gap-2 bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] px-8 py-2.5 backdrop-blur-xl">
            <Segmented label="Kind" value={kind} onChange={(k) => { setKind(k); setThemeId(null) }} options={[{ value: 'set', label: 'Sets' }, { value: 'minifig', label: 'Minifigures' }]} />
            <SearchInput value={search} onChange={setSearch} placeholder={kind === 'set' ? 'Search 20,000+ sets by name or number' : 'Search minifigures by name or number'} className="w-[340px]" />
            <Select value={themeId ?? ''} onChange={(e) => setThemeId(e.target.value ? Number(e.target.value) : null)} className="w-[200px]" aria-label="Theme">
              <option value="">All themes</option>
              {roots.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            {kind === 'set' && (
              <Select value={ordering} onChange={(e) => setOrdering(e.target.value)} className="w-[150px]" aria-label="Sort">
                {ORDER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
            <div className="flex-1" />
            {kind === 'set' && (
              <Tip label="Hides books, gear, and other items with no pieces">
                <label className="flex items-center gap-2 text-[12.5px] text-fg-2"><Switch label="Real sets only" checked={setsOnly} onCheckedChange={setSetsOnly} />Real sets only</label>
              </Tip>
            )}
            <label className="ml-3 flex items-center gap-2 text-[12.5px] text-fg-2"><Switch label="Hide what I own" checked={hideOwned} onCheckedChange={setHideOwned} />Hide what I own</label>
          </Rise>

          {results.isLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton h-[270px] !rounded-[18px]" />)}</div>
          ) : results.error ? (
            <Empty scene={<SceneSearch />} title="The catalog didn't answer" actions={<Button onClick={() => void results.refetch()}>Try again</Button>}>{(results.error as Error).message}</Empty>
          ) : !items.length ? (
            <Empty scene={<SceneSearch />} title={q ? `Nothing matches “${q}”` : 'Nothing to show'}>Try fewer words, another theme, or the number printed on the box.</Empty>
          ) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                {items.map((item, i) => {
                  const has = isOwned(item.set_num)
                  const wants = isWanted(item.set_num)
                  return (
                    <motion.article key={item.set_num} initial={i < 30 ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: (i % 30) * 0.02, ease: [0.22, 1, 0.36, 1] }}
                      className="cv-auto group flex cursor-pointer flex-col rounded-[18px] border border-line bg-panel p-2.5 transition-[border,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-2)]"
                      onClick={() => kind === 'set' && setDetail(item as CatalogSet)}>
                      <div className="relative">
                        <ItemImage src={item.set_img_url} alt="" className="aspect-[4/3] w-full rounded-[12px]" />
                        <div className="absolute left-2 top-2 flex gap-1">
                          {has && <Chip tone="up" icon={<Check />} className="bg-[#0e8f55] text-white">Owned</Chip>}
                          {!has && wants && <Chip className="border-transparent bg-[#1a1400] text-[#ffc929]" icon={<Heart />}>Wishlist</Chip>}
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-2.5">
                        <span className="font-mono text-[11.5px] text-accent-text">{item.set_num}</span>
                        <h3 className="mt-1 line-clamp-2 font-sans text-[13.5px] font-semibold leading-snug tracking-normal">{item.name}</h3>
                        <p className="mt-0.5 text-[12px] text-fg-3">{'year' in item ? `${item.year} · ` : ''}{formatNumber(item.num_parts)} pieces</p>
                        <div className="mt-auto flex items-center gap-1.5 pt-3" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant={has ? 'secondary' : 'primary'} className="flex-1" icon={<Plus className="size-3.5" />}
                            onClick={(e) => add(item, false, e.currentTarget.closest('article')?.querySelector('.plate') ?? null)}>
                            {has ? 'Add a copy' : 'I own this'}
                          </Button>
                          <IconButton label={wants ? 'On your wishlist' : 'Add to wishlist'} size="md" tone={wants ? 'active' : 'default'} disabled={has || wants}
                            onClick={(e) => add(item, true, e.currentTarget.closest('article')?.querySelector('.plate') ?? null)}>
                            <Heart className="size-4" fill={wants ? 'currentColor' : 'none'} />
                          </IconButton>
                        </div>
                      </div>
                    </motion.article>
                  )
                })}
              </div>
              <div className="mt-8 flex justify-center">
                {results.hasNextPage
                  ? <Button size="lg" onClick={() => void results.fetchNextPage()} loading={results.isFetchingNextPage}>Show more</Button>
                  : <p className="text-[12.5px] text-fg-4">That's everything{q ? ` for “${q}”` : ''}.</p>}
              </div>
            </>
          )}
        </>
      )}
      <SetDetail set={detail} onClose={() => setDetail(null)} />
    </Page>
  )
}

/** A catalog set up close: its minifigures, and what it sells for. */
function SetDetail({ set, onClose }: { set: CatalogSet | null; onClose: () => void }) {
  const { data: owned } = useOwnership()
  const { data: settings } = useSettings()
  const { addSet, addFig } = useAddItem()
  const detail = useQuery({ queryKey: ['catalog', 'detail', set?.set_num], queryFn: () => api.catalog.setDetail(set!.set_num), enabled: !!set, staleTime: Infinity })
  const priceNew = useQuery({ queryKey: ['catalog', 'price', set?.set_num, 'new'], queryFn: () => api.sell.price(set!.set_num, 'new'), enabled: !!set && !!settings?.keys.bricklink.set, staleTime: 3_600_000, retry: false })
  const priceUsed = useQuery({ queryKey: ['catalog', 'price', set?.set_num, 'used'], queryFn: () => api.sell.price(set!.set_num, 'used'), enabled: !!set && !!settings?.keys.bricklink.set, staleTime: 3_600_000, retry: false })
  const has = set ? owned?.owned.includes(set.set_num) : false

  return (
    <Sheet open={!!set} onOpenChange={(o) => !o && onClose()} title={set?.name ?? ''}>
      {set && (
        <div className="flex flex-col gap-6 px-6 pb-8 pt-6">
          <ItemImage src={set.set_img_url} alt={set.name} className="h-[230px] w-full rounded-[18px]" pad="p-6" />
          <div>
            <span className="font-mono text-[12px] text-accent-text">{set.set_num}</span>
            <h2 className="mt-1 font-display text-[22px] font-bold leading-tight">{set.name}</h2>
            <p className="mt-1 text-[12.5px] text-fg-3">{[detail.data?.theme, set.year, `${formatNumber(set.num_parts)} pieces`].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={(e) => void addSet(set.set_num, { as: 'owned', condition: 'sealed' }, { el: e.currentTarget, image: set.set_img_url })}>{has ? 'Add another copy' : 'I own this'}</Button>
            <Button icon={<Heart className="size-4" />} onClick={() => void addSet(set.set_num, { as: 'wanted' })}>Wishlist</Button>
            <Button variant="ghost" onClick={() => api.app.openExternal(set.set_url)}>Rebrickable</Button>
          </div>
          {settings?.keys.bricklink.set && (
            <section className="grid grid-cols-2 gap-3">
              {([{ label: 'Sealed', query: priceNew }, { label: 'Used', query: priceUsed }]).map(({ label, query }) => (
                <div key={label} className="rounded-[14px] border border-line bg-panel-2/60 p-4">
                  <div className="eyebrow">{label} · BrickLink</div>
                  <div className="tnum mt-1 font-display text-[22px] font-extrabold">{query.isLoading ? <Spinner /> : formatMoney(query.data?.avg ?? null)}</div>
                  <div className="mt-0.5 text-[11.5px] text-fg-3">{query.data ? (query.data.source === 'sold' ? `${query.data.samples} sold, last 6 months` : 'Cheapest listing') : query.error ? 'Unavailable' : 'No sales yet'}</div>
                </div>
              ))}
            </section>
          )}
          <section>
            <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-bold"><Users className="size-4 text-fg-3" />Minifigures{detail.data ? ` (${detail.data.minifigs.reduce((n, f) => n + f.quantity, 0)})` : ''}</h3>
            {detail.isLoading ? <Spinner /> : !detail.data?.minifigs.length ? <p className="text-[12.5px] text-fg-4">This set has no minifigures.</p> : (
              <ul className="flex flex-col gap-1">
                {detail.data.minifigs.map((f) => {
                  const ownsFig = owned?.owned.includes(f.set_num)
                  return (
                    <li key={f.set_num} className="flex items-center gap-3 rounded-[12px] px-1 py-1 hover:bg-hover">
                      <ItemImage src={f.set_img_url} alt="" className="size-11 shrink-0 rounded-[10px]" pad="p-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{f.set_name}</div>
                        <div className="font-mono text-[11px] text-fg-4">{f.set_num}{f.quantity > 1 ? ` · ×${f.quantity}` : ''}</div>
                      </div>
                      {ownsFig ? <Chip tone="up" icon={<Check />}>Owned</Chip> : (
                        <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />}
                          onClick={(e) => void addFig({ set_num: f.set_num, name: f.set_name, set_img_url: f.set_img_url, theme: detail.data?.theme, year: set.year }, { as: 'owned', quantity: f.quantity }, { el: e.currentTarget.closest('li')?.querySelector('.plate') })}>
                          Add
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </Sheet>
  )
}

