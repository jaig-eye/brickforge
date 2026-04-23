import { create } from 'zustand'

interface UiState {
  sidebarCollapsed: boolean
  sidecarReady: boolean
  sidecarPort: number
  setSidebarCollapsed: (v: boolean) => void
  toggleSidebar: () => void
  setSidecarReady: (ready: boolean, port?: number) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  sidecarReady: false,
  sidecarPort: 8741,

  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidecarReady: (ready, port) => set({ sidecarReady: ready, ...(port ? { sidecarPort: port } : {}) }),
}))
