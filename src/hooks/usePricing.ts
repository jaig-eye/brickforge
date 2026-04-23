import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { IPC } from '@/lib/ipc-types'

export function usePriceHistory(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ['price-history', entityType, entityId],
    queryFn: () => window.ipc.invoke(IPC.PRICE_HISTORY_GET, entityType, entityId),
    enabled: !!entityId,
    staleTime: 5 * 60_000,
  })
}

export function useFetchCurrentPrice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ setNum, condition }: { setNum: string; condition: string }) =>
      window.ipc.invoke(IPC.PRICE_FETCH_CURRENT, setNum, condition),
    onSuccess: (_data, { setNum }) =>
      qc.invalidateQueries({ queryKey: ['price-history', 'set', setNum] }),
  })
}
