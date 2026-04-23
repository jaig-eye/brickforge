import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IPC } from '@/lib/ipc-types'

export function useSets(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['sets', filter],
    queryFn: () => window.ipc.invoke(IPC.SETS_LIST, filter),
    staleTime: 30_000,
  })
}

export function useUpsertSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => window.ipc.invoke(IPC.SETS_UPSERT, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sets'] }),
  })
}

export function useDeleteSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => window.ipc.invoke(IPC.SETS_DELETE, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sets'] }),
  })
}

export function useMinifigures(filter: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['figs', filter],
    queryFn: () => window.ipc.invoke(IPC.FIGS_LIST, filter),
    staleTime: 30_000,
  })
}
