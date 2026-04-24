import { TrendingUp } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/Button'
import { FeatureGate } from '@/components/layout/FeatureGate'
import { useNavigate } from 'react-router-dom'

export default function ValueTracker() {
  const navigate = useNavigate()
  return (
    <FeatureGate flag="value_tracking">
      <PageShell
        title="Value Tracker"
        subtitle="Price history charts and alerts — coming soon"
      >
        <div className="p-6">
          <EmptyState
            icon={<TrendingUp className="h-8 w-8" />}
            title="Portfolio stats are on the Collection page"
            description="Current market values, gain/loss, and per-card pricing are shown in the Collection tab. Full price history charts and drop alerts are coming in a future update."
            action={
              <Button size="sm" onClick={() => navigate('/collection')}>
                Go to Collection
              </Button>
            }
          />
        </div>
      </PageShell>
    </FeatureGate>
  )
}
