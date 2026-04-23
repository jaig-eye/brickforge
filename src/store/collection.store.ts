import { create } from 'zustand'
import { IPC } from '@/lib/ipc-types'

interface LegoSet {
  id: number; set_number: string; name: string; year: number | null
  theme: string | null; piece_count: number | null; image_url: string | null
  is_owned: 0 | 1; is_wanted: 0 | 1; condition: string
  retail_price_usd: number | null; acquired_price: number | null
}

interface CollectionState {
  sets: LegoSet[]
  loading: boolean
  fetchSets: (filter?: Record<string, unknown>) => Promise<void>
  upsertSet: (data: Omit<LegoSet, 'id'>) => Promise<void>
  deleteSet: (id: number) => Promise<void>
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  sets: [],
  loading: false,

  fetchSets: async (filter = {}) => {
    set({ loading: true })
    const sets = await window.ipc.invoke(IPC.SETS_LIST, filter) as LegoSet[]
    set({ sets, loading: false })
  },

  upsertSet: async (data) => {
    await window.ipc.invoke(IPC.SETS_UPSERT, data)
    await get().fetchSets()
  },

  deleteSet: async (id) => {
    await window.ipc.invoke(IPC.SETS_DELETE, id)
    set((s) => ({ sets: s.sets.filter((x) => x.id !== id) }))
  },
}))
