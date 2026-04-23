import { useProfileStore } from '@/store/profile.store'
import type { ThemeId } from '@/lib/constants'

export function useTheme() {
  const { profile, update } = useProfileStore()
  const theme = (profile?.theme_name ?? 'dark-midnight') as ThemeId

  const setTheme = (id: ThemeId) => update({ theme_name: id })

  return { theme, setTheme }
}
