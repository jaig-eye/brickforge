/**
 * Ctrl K: one box for everything — jump to a page, open any item you own,
 * add a set by typing its number, or run an action. Keyboard-first.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as RD from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Camera, DatabaseBackup, FileUp, Home, LineChart, Moon, Package, Plus, RefreshCw, Search, Settings, Sun, Tag, BookOpen, CornerDownLeft } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useUi } from '@/lib/ui-store'
import { useSets, useFigs, useSettings, keys, invalidateCollection } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/cn'
import { SNAP } from '@/lib/motion'
import { Kbd } from '../ui/Field'
import { ItemImage } from '../ui/Bits'

interface Command {
  id: string
  group: string
  label: ReactNode
  hint?: string
  icon: ReactNode
  run: () => void | Promise<void>
}

const SET_NUM = /^\d{3,7}(-\d{1,2})?$/

export function CommandBar() {
  const open = useUi((s) => s.commandOpen)
  const setOpen = useUi((s) => s.setCommandOpen)
  const openAdd = useUi((s) => s.openAdd)
  const openSheet = useUi((s) => s.openSheet)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const { data: sets } = useSets({ scope: 'all' })
  const { data: figs } = useFigs({ scope: 'all' })
  const { data: settings } = useSettings()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!useUi.getState().commandOpen) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])
  useEffect(() => { if (open) { setQ(''); setIndex(0) } }, [open])

  const go = (path: string) => () => { navigate(path); setOpen(false) }

  const commands = useMemo<Command[]>(() => {
    const term = q.trim().toLowerCase()
    const out: Command[] = []
    if (SET_NUM.test(term)) {
      out.push({
        id: 'add-number', group: 'Add', icon: <Plus />, label: <>Add set <b className="font-mono">{term}</b> to your collection</>,
        run: async () => {
          setOpen(false)
          const id = toast.loading(`Adding ${term}…`)
          try {
            const r = await api.collection.addSet(term, { as: 'owned' })
            await invalidateCollection()
            toast.dismiss(id)
            toast.success(r.outcome === 'copy' ? `Added another copy of ${r.item.name}` : `Added ${r.item.name}`, { action: { label: 'View', run: () => openSheet('set', r.item.set_number) } })
          } catch (err) { toast.dismiss(id); toast.error(err, `Couldn't add ${term}`) }
        },
      })
    }
    const actions: Command[] = [
      { id: 'add', group: 'Actions', icon: <Plus />, label: 'Add a set or minifigure', hint: 'Search the catalog', run: () => openAdd() },
      { id: 'scan', group: 'Actions', icon: <Camera />, label: 'Scan photos', hint: 'Identify sets and minifigures', run: go('/scan') },
      { id: 'refresh', group: 'Actions', icon: <RefreshCw />, label: 'Update prices now', hint: 'From BrickLink', run: async () => { setOpen(false); try { await api.prices.refresh() } catch (err) { toast.error(err) } } },
      { id: 'import', group: 'Actions', icon: <FileUp />, label: 'Import a collection file', hint: 'CSV or BrickLink XML', run: go('/collection?import=1') },
      { id: 'backup', group: 'Actions', icon: <DatabaseBackup />, label: 'Back up now', run: async () => { setOpen(false); try { const n = await api.data.backupNow(); toast.success('Backed up', { body: n }) } catch (err) { toast.error(err) } } },
      {
        id: 'theme', group: 'Actions', icon: settings?.theme === 'light' ? <Moon /> : <Sun />, label: settings?.theme === 'light' ? 'Switch to dark' : 'Switch to light',
        run: async () => { setOpen(false); const s = await api.settings.setPrefs({ theme: settings?.theme === 'light' ? 'dark' : 'light' }); qc.setQueryData(keys.settings, s) },
      },
    ]
    const pages: Command[] = [
      { id: 'p-home', group: 'Go to', icon: <Home />, label: 'Home', run: go('/') },
      { id: 'p-coll', group: 'Go to', icon: <Package />, label: 'Collection', run: go('/collection') },
      { id: 'p-cat', group: 'Go to', icon: <BookOpen />, label: 'Catalog', run: go('/catalog') },
      { id: 'p-scan', group: 'Go to', icon: <Camera />, label: 'Scan', run: go('/scan') },
      { id: 'p-value', group: 'Go to', icon: <LineChart />, label: 'Value', run: go('/value') },
      { id: 'p-sell', group: 'Go to', icon: <Tag />, label: 'Sell', run: go('/sell') },
      { id: 'p-settings', group: 'Go to', icon: <Settings />, label: 'Settings', run: go('/settings') },
    ]
    const match = (c: Command) => !term || String(typeof c.label === 'string' ? c.label : c.id).toLowerCase().includes(term) || (c.hint ?? '').toLowerCase().includes(term)
    out.push(...actions.filter(match))

    if (term.length >= 2) {
      const hits: Command[] = []
      for (const s of sets ?? []) {
        if (hits.length >= 6) break
        if (`${s.name} ${s.set_number} ${s.theme ?? ''}`.toLowerCase().includes(term)) {
          hits.push({ id: `s-${s.id}`, group: 'Your collection', icon: <ItemImage src={s.image_url} alt="" className="size-7 rounded-[7px]" pad="p-0.5" />,
            label: s.name, hint: `${s.set_number}${s.is_owned ? '' : ' · wishlist'}`, run: () => openSheet('set', s.set_number) })
        }
      }
      for (const f of figs ?? []) {
        if (hits.length >= 10) break
        if (`${f.name} ${f.fig_number} ${f.bricklink_id ?? ''}`.toLowerCase().includes(term)) {
          hits.push({ id: `f-${f.id}`, group: 'Your collection', icon: <ItemImage src={f.image_url} alt="" className="size-7 rounded-[7px]" pad="p-0.5" />,
            label: f.name, hint: `${f.bricklink_id ?? f.fig_number}${f.is_owned ? '' : ' · wishlist'}`, run: () => openSheet('minifig', f.fig_number) })
        }
      }
      out.push(...hits)
      out.push({ id: 'catalog-search', group: 'Catalog', icon: <Search />, label: <>Search the catalog for “{q.trim()}”</>, run: go(`/catalog?q=${encodeURIComponent(q.trim())}`) })
    }
    out.push(...pages.filter(match))
    return out
  }, [q, sets, figs, settings?.theme])

  useEffect(() => { setIndex(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(commands.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); void commands[index]?.run() }
  }

  let lastGroup = ''
  return (
    <RD.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            <RD.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-[80] bg-[var(--scrim)] backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} />
            </RD.Overlay>
            <RD.Content asChild forceMount onKeyDown={onKeyDown}>
              <motion.div className="fixed left-1/2 top-[14vh] z-[80] w-[min(620px,calc(100vw-48px))] overflow-hidden rounded-[20px] border border-line bg-panel shadow-[var(--shadow-3)]"
                style={{ x: '-50%' }} initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={SNAP}>
                <RD.Title className="sr-only">Command bar</RD.Title>
                <RD.Description className="sr-only">Search your collection, the catalog, or run an action.</RD.Description>
                <div className="flex items-center gap-3 border-b border-line px-4">
                  <Search className="size-[18px] text-fg-3" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a set number, a name, or an action"
                    className="h-14 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-4 focus:outline-none focus-visible:outline-none" aria-controls="cmd-list" aria-activedescendant={`cmd-${index}`} />
                  <Kbd>Esc</Kbd>
                </div>
                <div ref={listRef} id="cmd-list" role="listbox" className="max-h-[54vh] overflow-y-auto p-2">
                  {commands.length === 0 && <div className="px-3 py-10 text-center text-[13px] text-fg-3">Nothing matches “{q}”.</div>}
                  {commands.map((c, i) => {
                    const header = c.group !== lastGroup ? c.group : null
                    lastGroup = c.group
                    return (
                      <div key={c.id}>
                        {header && <div className="eyebrow px-3 pb-1 pt-3 first:pt-1">{header}</div>}
                        <div id={`cmd-${i}`} data-idx={i} role="option" aria-selected={i === index}
                          onMouseMove={() => setIndex(i)} onClick={() => void c.run()}
                          className={cn('flex h-11 cursor-default items-center gap-3 rounded-[11px] px-3 text-[13.5px]', i === index ? 'bg-hover text-fg' : 'text-fg-2')}>
                          <span className="grid size-7 shrink-0 place-items-center text-fg-3 [&>svg]:size-[17px]">{c.icon}</span>
                          <span className="min-w-0 flex-1 truncate">{c.label}</span>
                          {c.hint && <span className="truncate font-mono text-[11.5px] text-fg-4">{c.hint}</span>}
                          {i === index && (c.group === 'Go to' ? <ArrowRight className="size-4 text-fg-3" /> : <CornerDownLeft className="size-4 text-fg-3" />)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  )
}
