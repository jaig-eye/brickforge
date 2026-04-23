import { useQuery } from '@tanstack/react-query'
import { IPC } from '@/lib/ipc-types'

interface FeatureFlag {
  key: string
  enabled: 0 | 1
  tier: string
  description: string | null
}

export function useFeatureFlags() {
  const { data: flags = [] } = useQuery<FeatureFlag[]>({
    queryKey: ['feature-flags'],
    queryFn: () => window.ipc.invoke(IPC.FLAGS_GET_ALL) as Promise<FeatureFlag[]>,
    staleTime: 60_000,
  })

  const isEnabled = (key: string): boolean =>
    flags.find((f) => f.key === key)?.enabled === 1

  return { flags, isEnabled }
}
