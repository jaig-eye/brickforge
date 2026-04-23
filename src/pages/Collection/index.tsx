import { useState } from 'react'
import { Plus, Search, Package } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { SetCard } from '@/components/shared/SetCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { useSets } from '@/hooks/useCollection'

type Tab = 'owned' | 'wanted' | 'all'

export default function Collection() {
  const [tab, setTab] = useState<Tab>('owned')
  const [search, setSearch] = useState('')

  const filter = tab === 'owned' ? { is_owned: 1 } : tab === 'wanted' ? { is_wanted: 1 } : {}
  const { data: sets = [], isLoading } = useSets(filter) as { data: unknown[]; isLoading: boolean }

  const filtered = search
    ? (sets as { name: string; set_number: string }[]).filter(
        (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.set_number.includes(search)
      )
    : sets

  return (
    <PageShell
      title="Collection"
      subtitle="Your LEGO sets and minifigures"
      actions={<Button size="sm"><Plus className="h-4 w-4" />Add Set</Button>}
    >
      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--color-surface-overlay)] rounded-lg p-1 w-fit mb-4">
          {(['owned', 'wanted', 'all'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold font-display capitalize transition-colors ${
                tab === t
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                  : 'hover:bg-[var(--color-surface-muted)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mb-4 max-w-sm">
          <Input
            placeholder="Search sets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="No sets yet"
            description="Search for a set by number or name to add it to your collection."
            action={<Button size="sm"><Plus className="h-4 w-4" />Add Set</Button>}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {(filtered as Parameters<typeof SetCard>[0]['set'][]).map((set) => (
              <SetCard key={set.set_number} set={set} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
