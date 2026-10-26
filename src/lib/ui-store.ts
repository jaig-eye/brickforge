/**
 * UI state shared across screens: the command bar, the Add dialog, the item
 * sheet (openable from anywhere), and the "fly home" animation queue.
 */
import { create } from 'zustand'
import type { EntityKind } from './types'

export interface Flight {
  id: number
  src: string | null
  from: { x: number; y: number; w: number; h: number }
}

interface UiState {
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void

  addOpen: boolean
  addPreset: { kind: EntityKind; query?: string; as?: 'owned' | 'wanted' } | null
  openAdd: (preset?: UiState['addPreset']) => void
  closeAdd: () => void

  sheet: { kind: EntityKind; number: string } | null
  openSheet: (kind: EntityKind, number: string) => void
  closeSheet: () => void

  /** Where the Collection rail icon is, so additions can fly into it. */
  collectionTarget: DOMRect | null
  setCollectionTarget: (r: DOMRect | null) => void
  flights: Flight[]
  bump: number
  fly: (src: string | null, fromEl: Element | null) => void
  land: (id: number) => void

  splashDone: boolean
  setSplashDone: () => void
}

let flightId = 0

export const useUi = create<UiState>((set) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),

  addOpen: false,
  addPreset: null,
  openAdd: (addPreset = null) => set({ addOpen: true, addPreset, commandOpen: false }),
  closeAdd: () => set({ addOpen: false }),

  sheet: null,
  openSheet: (kind, number) => set({ sheet: { kind, number }, commandOpen: false }),
  closeSheet: () => set({ sheet: null }),

  collectionTarget: null,
  setCollectionTarget: (collectionTarget) => set({ collectionTarget }),
  flights: [],
  bump: 0,
  fly: (src, fromEl) => {
    const r = fromEl?.getBoundingClientRect()
    if (!r) { set((s) => ({ bump: s.bump + 1 })); return }
    const flight = { id: ++flightId, src, from: { x: r.left, y: r.top, w: r.width, h: r.height } }
    set((s) => ({ flights: [...s.flights, flight] }))
  },
  land: (id) => set((s) => ({ flights: s.flights.filter((f) => f.id !== id), bump: s.bump + 1 })),

  splashDone: false,
  setSplashDone: () => set({ splashDone: true }),
}))
