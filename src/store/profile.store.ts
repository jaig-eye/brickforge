import { create } from 'zustand'
import { IPC } from '@/lib/ipc-types'
import type { ThemeId } from '@/lib/constants'

interface Profile {
  id: number
  display_name: string
  avatar_id: string
  theme_name: ThemeId
  color_accent: string
}

interface ProfileState {
  profile: Profile | null
  loading: boolean
  fetch: () => Promise<void>
  update: (patch: Partial<Omit<Profile, 'id'>>) => Promise<void>
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  loading: false,

  fetch: async () => {
    set({ loading: true })
    const profile = await window.ipc.invoke(IPC.PROFILE_GET) as Profile
    set({ profile, loading: false })
    applyTheme(profile.theme_name)
  },

  update: async (patch) => {
    const updated = await window.ipc.invoke(IPC.PROFILE_UPDATE, patch) as Profile
    set({ profile: updated })
    if (patch.theme_name) applyTheme(patch.theme_name)
  },
}))

function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-theme', theme)
  if (theme === 'light-studio') document.documentElement.classList.add('light')
  else document.documentElement.classList.remove('light')
}
