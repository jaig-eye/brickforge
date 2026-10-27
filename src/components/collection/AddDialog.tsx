import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Heart, Plus, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { useUi } from '@/lib/ui-store'
import { useFigIds, useOwnership } from '@/lib/queries'
import { useDebounced } from '@/hooks/useDebounced'
import { useAddItem } from '@/hooks/useAddItem'
import type { EntityKind } from '@/lib/types'
import { formatNumber } from '@/lib/formatters'
import { Dialog } from '../ui/Overlay'
import { Segmented } from '../ui/Segmented'
import { SearchInput, Select, Input } from '../ui/Field'
import { Button, IconButton } from '../ui/Button'
import { Chip, ItemImage, Empty, Spinner } from '../ui/Bits'
import { SceneKey, SceneSearch } from '../brick/Scenes'

const SET_NUM = /^\d{3,7}(-\d{1,2})?$/

/** Search the catalog and add sets or minifigures in one click. */
export function AddDialog() {
  const open = useUi((s) => s.addOpen)
  const preset = useUi((s) => s.addPreset)
  const close = useUi((s) => s.closeAdd)
  const navigate = useNavigate()
  const [kind, setKind] = useState<EntityKind>('set')
  const [q, setQ] = useState('')
  const [as, setAs] = useState<'owned' | 'wanted'>('owned')
  const [condition, setCondition] = useState('sealed')
  const [paid, setPaid] = useState('')
  const term = useDebounced(q.trim(), 350)
  const { data: owned } = useOwnership()
  const { addSet, addFig } = useAddItem()
  const [busy, setBusy] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setKind(preset?.kind ?? 'set')
    setQ(preset?.query ?? '')
    setAs(preset?.as ?? 'owned')
  }, [open, preset])
  useEffect(() => { setCondition(kind === 'set' ? 'sealed' : 'used') }, [kind])

  const results = useQuery({
    queryKey: ['add-search', kind, term],
    enabled: open && term.length >= 2,
    queryFn: () => (kind === 'set' ? api.catalog.sets({ search: term, ordering: '-year' }) : api.catalog.figs({ search: term })),
    staleTime: 60_000,
  })

  const opts = () => ({ as, condition, acquired_price: as === 'owned' && Number(paid) > 0 ? Number(paid) : null })
  const isOwned = (n: string) => owned?.owned.includes(n)
  const isWanted = (n: string) => owned?.wanted.includes(n)

  const list = results.data?.results ?? []
  const blIds = useFigIds(kind === 'minifig' ? list : undefined)
  const add = async (num: string, wanted: boolean, el: Element | null, image: string | null, name?: string) => {
    setBusy(`${num}:${wanted}`)
    const o = { ...opts(), as: wanted ? 'wanted' as const : 'owned' as const }
    if (kind === 'set') await addSet(num, o, { el, image })
    else await addFig({ set_num: num, name: name ?? num, set_img_url: image, bricklink_id: blIds[num] ?? null }, o, { el })
    setBusy(null)
  }

  const missingKey = results.error instanceof AppError && (results.error.code === 'missing_key' || results.error.code === 'auth')

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title="Add to your collection" width={680}
      description="Search the LEGO catalog by name or number. Pick how it's added below.">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Segmented label="What to add" value={kind} onChange={setKind} options={[{ value: 'set', label: 'Sets' }, { value: 'minifig', label: 'Minifigures' }]} />
          <SearchInput inputRef={inputRef} autoFocus value={q} onChange={setQ} className="flex-1"
            placeholder={kind === 'set' ? 'Set name or number, e.g. 10497 or "Galaxy Explorer"' : 'Character or number, e.g. "Clone Trooper" or sw0001'} />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-panel-2/60 px-3 py-2 text-[12.5px] text-fg-3">
          <span>Add as</span>
          <Segmented size="sm" label="Add as" value={as} onChange={setAs} options={[{ value: 'owned', label: 'Owned' }, { value: 'wanted', label: 'Wishlist' }]} />
          {as === 'owned' && (
            <>
              <span className="ml-2">in</span>
              <Select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-[150px]" aria-label="Condition">
                {kind === 'set'
                  ? <><option value="sealed">Sealed</option><option value="open_complete">Opened, complete</option><option value="open_incomplete">Opened, incomplete</option></>
                  : <><option value="new">New</option><option value="used">Used</option><option value="cracked">Damaged</option></>}
              </Select>
              <span className="ml-2">paid</span>
              <div className="relative w-[96px]">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-4">$</span>
                <Input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ''))} placeholder="optional" className="pl-5" aria-label="Price paid" />
              </div>
            </>
          )}
        </div>

        <div className="min-h-[300px]">
          {kind === 'set' && SET_NUM.test(q.trim()) && (
            <button type="button" onClick={(e) => void add(q.trim(), as === 'wanted', e.currentTarget, null)}
              className="mb-2 flex w-full items-center gap-3 rounded-[12px] border border-dashed border-line-strong px-3 py-2.5 text-left text-[13px] text-fg-2 hover:bg-hover">
              <Plus className="size-4 text-accent-text" />Add set <b className="font-mono">{q.trim()}</b> directly by its number
            </button>
          )}
          {missingKey ? (
            <Empty scene={<SceneKey />} title="Add a free Rebrickable key to search"
              actions={<Button variant="primary" onClick={() => { close(); navigate('/settings#connections') }}>Open Settings</Button>}>
              The catalog comes from Rebrickable. A key is free and takes a minute to create.
            </Empty>
          ) : term.length < 2 ? (
            <div className="grid h-[280px] place-items-center text-center text-[13px] text-fg-4">Start typing to search {kind === 'set' ? '20,000+ sets' : '15,000+ minifigures'}.</div>
          ) : results.isFetching && !list.length ? (
            <div className="grid h-[280px] place-items-center"><Spinner className="size-6" /></div>
          ) : results.error ? (
            <Empty scene={<SceneSearch />} title="The search didn't go through">{(results.error as Error).message}</Empty>
          ) : !list.length ? (
            <Empty scene={<SceneSearch />} title={`Nothing in the catalog matches “${term}”`}>Try fewer words, or the number printed on the box.</Empty>
          ) : (
            <ul className="flex flex-col gap-1">
              {list.map((item) => {
                const num = item.set_num
                const img = item.set_img_url
                const has = isOwned(num)
                const wants = isWanted(num)
                const bl = blIds[num]
                return (
                  <li key={num} className="group flex items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-hover">
                    <ItemImage src={img} alt={item.name} className="size-[52px] shrink-0 rounded-[10px]" pad="p-1" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-fg">{item.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[11.5px] text-fg-3">
                        {/* BrickLink's id once known; until then Rebrickable's number, dimmed */}
                        {bl ? <span title={`Rebrickable ${num}`}>{bl}</span> : <span className={kind === 'minifig' ? 'text-fg-4' : undefined}>{num}</span>}
                        {'year' in item ? <span>· {String((item as { year: number }).year)}</span> : null}
                        <span>· {formatNumber(item.num_parts)} pcs</span>
                      </div>
                    </div>
                    {has && <Chip tone="up" icon={<Check />}>Owned</Chip>}
                    {!has && wants && <Chip tone="accent" icon={<Heart />}>Wishlist</Chip>}
                    <IconButton label="Add to wishlist" size="sm" tone={wants ? 'active' : 'default'} disabled={!!busy}
                      onClick={(e) => void add(num, true, e.currentTarget.closest('li')?.querySelector('.plate') ?? null, img, item.name)}>
                      <Heart className="size-4" />
                    </IconButton>
                    <Button size="sm" variant={has ? 'secondary' : 'primary'} icon={<Plus className="size-3.5" />} loading={busy === `${num}:false`} disabled={!!busy}
                      onClick={(e) => void add(num, false, e.currentTarget.closest('li')?.querySelector('.plate') ?? null, img, item.name)}>
                      {has ? 'Add a copy' : 'Add'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  )
}
