/**
 * Adding things to the collection from anywhere (Catalog, Scan, the Add
 * dialog, the command bar): one place for the API call, the fly-home
 * animation, the toast with its follow-up actions, and cache refresh.
 */
import { useCallback } from 'react'
import { api } from '@/lib/api'
import { invalidateCollection } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useUi } from '@/lib/ui-store'
import type { AddOptions, CatalogFig } from '@/lib/types'

const OUTCOME: Record<string, (name: string, as: string) => string> = {
  added: (n, as) => (as === 'wanted' ? `${n} is on your wishlist` : `Added ${n}`),
  copy: (n) => `Added another copy of ${n}`,
  moved: (n) => `${n} moved from your wishlist to your collection`,
  exists: (n) => `${n} is already in your collection`,
}

export function useAddItem() {
  const fly = useUi((s) => s.fly)
  const openSheet = useUi((s) => s.openSheet)

  const addSet = useCallback(async (setNumber: string, opts: AddOptions, from?: { el?: Element | null; image?: string | null }) => {
    try {
      const r = await api.collection.addSet(setNumber, opts)
      if (r.outcome !== 'exists' && opts.as === 'owned') fly(from?.image ?? r.item.image_url, from?.el ?? null)
      await invalidateCollection()
      const actions = { label: 'Details', run: () => openSheet('set', r.item.set_number) }
      toast.success(OUTCOME[r.outcome](r.item.name, opts.as), { action: actions })
      // A newly owned set: offer its minifigures too
      if (opts.as === 'owned' && r.outcome === 'added') {
        api.catalog.setDetail(r.item.set_number).then((d) => {
          const count = d.minifigs.reduce((n, f) => n + (f.quantity || 1), 0)
          if (!count) return
          toast.info(`${r.item.name} comes with ${count} minifigure${count === 1 ? '' : 's'}`, {
            action: {
              label: 'Add them',
              run: async () => {
                for (const f of d.minifigs) {
                  await api.collection.addFig({ set_num: f.set_num, name: f.set_name, set_img_url: f.set_img_url, theme: d.theme, year: d.set.year },
                    { as: 'owned', quantity: f.quantity, condition: opts.condition === 'sealed' ? 'new' : 'used' })
                }
                await invalidateCollection()
                toast.success(`Added ${count} minifigure${count === 1 ? '' : 's'} from ${r.item.name}`)
              },
            },
            duration: 9000,
          })
        }).catch(() => undefined)
      }
      return r
    } catch (err) {
      toast.error(err, `Couldn't add ${setNumber}`)
      return null
    }
  }, [fly, openSheet])

  const addFig = useCallback(async (fig: Partial<CatalogFig> & { set_num: string; bricklink_id?: string | null; theme?: string | null; year?: number | null }, opts: AddOptions, from?: { el?: Element | null }) => {
    try {
      const r = await api.collection.addFig(fig, opts)
      if (r.outcome !== 'exists' && opts.as === 'owned') fly(fig.set_img_url ?? r.item.image_url, from?.el ?? null)
      await invalidateCollection()
      toast.success(OUTCOME[r.outcome](r.item.name, opts.as), { action: { label: 'Details', run: () => openSheet('minifig', r.item.fig_number) } })
      return r
    } catch (err) {
      toast.error(err, `Couldn't add ${fig.name ?? fig.set_num}`)
      return null
    }
  }, [fly, openSheet])

  return { addSet, addFig }
}
