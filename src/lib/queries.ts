/**
 * Data hooks. Every screen reads through these, so one invalidation (after a
 * mutation, or when the main process says data changed) refreshes every view
 * that shows the same numbers.
 */
import { QueryClient, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from './api'
import { IPC } from './ipc-types'
import type { CollectionQuery, EntityKind, RefreshStatus, ScanJob, SyncStatus, UpdateState } from './types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false },
  },
})

export const keys = {
  settings: ['settings'] as const,
  info: ['info'] as const,
  sets: (q: CollectionQuery) => ['collection', 'sets', q] as const,
  figs: (q: CollectionQuery) => ['collection', 'figs', q] as const,
  themes: ['collection', 'themes'] as const,
  ownership: ['collection', 'ownership'] as const,
  tags: ['collection', 'tags'] as const,
  summary: ['prices', 'summary'] as const,
  portfolio: (days: number) => ['prices', 'portfolio', days] as const,
  movers: (days: number) => ['prices', 'movers', days] as const,
  history: (kind: EntityKind, id: string) => ['prices', 'history', kind, id] as const,
  alerts: ['prices', 'alerts'] as const,
  refresh: ['prices', 'refresh'] as const,
  scan: ['scan', 'jobs'] as const,
  listings: ['sell', 'history'] as const,
  backups: ['data', 'backups'] as const,
  health: ['data', 'health'] as const,
  sync: ['sync'] as const,
  update: ['update'] as const,
}

/** Everything that shows collection contents or prices. */
export function invalidateCollection(): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['collection'] }),
    queryClient.invalidateQueries({ queryKey: ['prices'] }),
  ]).then(() => undefined)
}

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.settings.get, staleTime: Infinity })
export const useAppInfo = () => useQuery({ queryKey: keys.info, queryFn: api.app.info, staleTime: Infinity })
export const useSets = (q: CollectionQuery) => useQuery({ queryKey: keys.sets(q), queryFn: () => api.collection.sets(q), placeholderData: keepPreviousData })
export const useFigs = (q: CollectionQuery) => useQuery({ queryKey: keys.figs(q), queryFn: () => api.collection.figs(q), placeholderData: keepPreviousData })
export const useThemes = () => useQuery({ queryKey: keys.themes, queryFn: api.collection.themes })
export const useOwnership = () => useQuery({ queryKey: keys.ownership, queryFn: api.collection.ownership })
export const useTags = () => useQuery({ queryKey: keys.tags, queryFn: api.tags.list })
export const useSummary = () => useQuery({ queryKey: keys.summary, queryFn: api.prices.summary })
export const usePortfolio = (days: number) => useQuery({ queryKey: keys.portfolio(days), queryFn: () => api.prices.portfolio(days), placeholderData: keepPreviousData })
export const useMovers = (days: number) => useQuery({ queryKey: keys.movers(days), queryFn: () => api.prices.movers(days, 8), placeholderData: keepPreviousData })
export const usePriceHistory = (kind: EntityKind, id: string) => useQuery({ queryKey: keys.history(kind, id), queryFn: () => api.prices.history(kind, id) })
export const useAlerts = () => useQuery({ queryKey: keys.alerts, queryFn: api.alerts.list })
export const useRefreshStatus = () => useQuery({ queryKey: keys.refresh, queryFn: api.prices.status, staleTime: Infinity })
export const useScanJobs = () => useQuery({ queryKey: keys.scan, queryFn: api.scan.list, staleTime: Infinity })
export const useListings = () => useQuery({ queryKey: keys.listings, queryFn: api.sell.history })
export const useBackups = () => useQuery({ queryKey: keys.backups, queryFn: api.data.backups })
export const useHealth = () => useQuery({ queryKey: keys.health, queryFn: api.data.health })
export const useSyncStatus = () => useQuery({ queryKey: keys.sync, queryFn: api.sync.status, staleTime: Infinity })
export const useUpdateState = () => useQuery({ queryKey: keys.update, queryFn: api.updates.state, staleTime: Infinity })

/** Mirror main-process push events into the query cache. Mount once. */
export function usePushSync(): void {
  const qc = useQueryClient()
  useEffect(() => {
    const offs = [
      api.on<ScanJob[]>(IPC.PUSH_SCAN, (jobs) => qc.setQueryData(keys.scan, jobs)),
      api.on<RefreshStatus>(IPC.PUSH_REFRESH, (s) => {
        qc.setQueryData(keys.refresh, s)
        if (!s.running) void invalidateCollection()
      }),
      api.on<SyncStatus>(IPC.PUSH_SYNC, (s) => qc.setQueryData(keys.sync, s)),
      api.on<UpdateState>(IPC.PUSH_UPDATE, (s) => qc.setQueryData(keys.update, s)),
      api.on(IPC.PUSH_DATA_CHANGED, () => { void invalidateCollection() }),
      api.on(IPC.PUSH_ALERTS, () => { void qc.invalidateQueries({ queryKey: keys.alerts }) }),
    ]
    return () => offs.forEach((off) => off())
  }, [qc])
}
