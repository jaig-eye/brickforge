import { LayoutDashboard, Package, TrendingUp, Heart } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useProfileStore } from '@/store/profile.store'
import { useSets } from '@/hooks/useCollection'

export default function Dashboard() {
  const { profile } = useProfileStore()
  const { data: ownedSets = [] } = useSets({ is_owned: 1 }) as { data: unknown[] }
  const { data: wantedSets = [] } = useSets({ is_wanted: 1 }) as { data: unknown[] }

  return (
    <PageShell
      title={`Welcome back, ${profile?.display_name ?? 'Builder'}!`}
      subtitle="Your LEGO command center"
    >
      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Package,    label: 'Sets Owned',   value: ownedSets.length,  color: 'text-green-400'  },
          { icon: Heart,      label: 'Wanted',        value: wantedSets.length, color: 'text-red-400'    },
          { icon: TrendingUp, label: 'Portfolio',      value: '—',               color: 'text-blue-400'   },
          { icon: Package,    label: 'Minifigures',    value: '—',               color: 'text-yellow-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label} variant="flat" className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[var(--color-surface-overlay)] p-2">
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold font-display">{value}</p>
                <p className="text-xs text-[var(--color-surface-muted)]">{label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="px-6 pb-6">
        <Card>
          <CardHeader stud>
            <h2 className="text-sm font-bold font-display text-black">Quick Start</h2>
          </CardHeader>
          <CardContent className="py-6">
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { label: 'Add a Set',        desc: 'Search Rebrickable and add to your collection',  href: '/collection' },
                { label: 'Identify a Photo', desc: 'Take a photo and AI will identify the set',       href: '/lookup'     },
                { label: 'Track Values',     desc: 'Connect BrickLink to see your portfolio value',   href: '/value'      },
              ].map(({ label, desc, href }) => (
                <a
                  key={label}
                  href={href}
                  className="block p-4 rounded-lg border border-[var(--color-surface-border)] hover:border-[var(--color-accent)] transition-colors"
                >
                  <p className="font-semibold font-display text-sm">{label}</p>
                  <p className="text-xs text-[var(--color-surface-muted)] mt-1">{desc}</p>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
