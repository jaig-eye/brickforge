import { TrendingUp, RefreshCw } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { FeatureGate } from '@/components/layout/FeatureGate'
import { formatCurrency } from '@/lib/formatters'

export default function ValueTracker() {
  return (
    <FeatureGate flag="value_tracking">
      <PageShell
        title="Value Tracker"
        subtitle="Monitor your collection's BrickLink market value"
        actions={
          <Button variant="secondary" size="sm">
            <RefreshCw className="h-4 w-4" />
            Refresh Prices
          </Button>
        }
      >
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Collection Value', value: '—',   sub: 'Used market avg'   },
              { label: 'New Value',        value: '—',   sub: 'New sealed avg'    },
              { label: 'Gain/Loss',        value: '—',   sub: 'vs acquired price' },
            ].map(({ label, value, sub }) => (
              <Card key={label} className="p-4">
                <p className="text-2xl font-bold font-display">{value}</p>
                <p className="text-sm font-medium mt-1">{label}</p>
                <p className="text-xs text-[var(--color-surface-muted)]">{sub}</p>
              </Card>
            ))}
          </div>

          <EmptyState
            icon={<TrendingUp className="h-8 w-8" />}
            title="Set up BrickLink to track values"
            description="Add your BrickLink API credentials in Settings to start fetching real-time price data."
            action={
              <Button variant="secondary" size="sm" onClick={() => window.ipc.send('bf:app:navigate', '/settings')}>
                Go to Settings
              </Button>
            }
          />
        </div>
      </PageShell>
    </FeatureGate>
  )
}
