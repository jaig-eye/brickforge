import type { ReactNode } from 'react'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { Badge } from '@/components/ui/Badge'
import { Lock } from 'lucide-react'

interface FeatureGateProps {
  flag: string
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureGate({ flag, children, fallback }: FeatureGateProps) {
  const { isEnabled } = useFeatureFlags()

  if (isEnabled(flag)) return <>{children}</>

  if (fallback) return <>{fallback}</>

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full py-24 text-center">
      <div className="rounded-full bg-[var(--color-surface-overlay)] p-5">
        <Lock className="h-8 w-8 text-[var(--color-surface-muted)]" />
      </div>
      <div>
        <Badge variant="premium" className="mb-2">Premium Feature</Badge>
        <h2 className="text-xl font-bold font-display mt-2">Coming Soon</h2>
        <p className="text-sm text-[var(--color-surface-muted)] mt-1 max-w-sm">
          This feature is in development and will be available in a future release.
        </p>
      </div>
    </div>
  )
}
