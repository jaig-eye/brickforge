import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, TrendingUp, TrendingDown, Heart, Users, Tag, Search, Wand2 } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { useProfileStore } from '@/store/profile.store'
import { useSets, useMinifigures } from '@/hooks/useCollection'
import { IPC } from '@/lib/ipc-types'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/cn'

interface PortfolioStats {
  set_count: number
  minifig_count: number
  acquired_total: number
  fig_acquired_total: number
  priced_count: number
  fig_priced_count: number
  wanted_count: number
}

type PriceMap = Record<string, { new?: number; used?: number }>

interface LegoSetDetail {
  set_number: string
  condition: 'sealed' | 'open_complete' | 'open_incomplete' | 'new' | 'used'
  is_owned: 0 | 1
  acquired_price?: number | null
}

interface MinifigDetail {
  fig_number: string
  condition: 'new' | 'used' | 'cracked'
  is_owned: 0 | 1
}

export default function Dashboard() {
  const navigate     = useNavigate()
  const { profile }  = useProfileStore()

  const { data: ownedSets  = [] } = useSets({ is_owned: 1 })  as { data: unknown[] }
  const { data: wantedSets = [] } = useSets({ is_wanted: 1 }) as { data: unknown[] }
  const { data: ownedFigs  = [] } = useMinifigures({ is_owned: 1 }) as { data: unknown[] }

  const [stats,       setStats]       = useState<PortfolioStats | null>(null)
  const [priceMap,    setPriceMap]    = useState<PriceMap>({})
  const [figPriceMap, setFigPriceMap] = useState<PriceMap>({})

  const loadStats = useCallback(() => {
    window.ipc.invoke(IPC.PRICE_PORTFOLIO_STATS)
      .then((r) => setStats(r as PortfolioStats))
      .catch(() => {})
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  useEffect(() => {
    const nums = (ownedSets as { set_number: string }[]).map(s => s.set_number)
    if (!nums.length) { setPriceMap({}); return }
    window.ipc.invoke(IPC.PRICE_GET_BULK, nums)
      .then(r => setPriceMap(r as PriceMap))
      .catch(() => {})
  }, [ownedSets])

  useEffect(() => {
    const nums = (ownedFigs as { fig_number: string }[]).map(f => f.fig_number)
    if (!nums.length) { setFigPriceMap({}); return }
    window.ipc.invoke(IPC.PRICE_GET_BULK_FIGS, nums)
      .then(r => setFigPriceMap(r as PriceMap))
      .catch(() => {})
  }, [ownedFigs])

  // Condition-aware market total — mirrors Collection page logic
  const totalSetMarket = (ownedSets as LegoSetDetail[]).reduce((sum, s) => {
    const p = priceMap[s.set_number]
    const price = (s.condition === 'sealed' || s.condition === 'new') ? p?.new : p?.used
    return sum + (price ?? 0)
  }, 0)
  const totalFigMarket = (ownedFigs as MinifigDetail[]).reduce((sum, f) => {
    const p = figPriceMap[f.fig_number]
    const price = f.condition === 'new' ? p?.new : p?.used
    return sum + (price ?? 0)
  }, 0)
  const totalMarket   = totalSetMarket + totalFigMarket
  const totalInvested = stats ? stats.acquired_total + stats.fig_acquired_total : 0
  const gainLoss      = totalMarket > 0 && totalInvested > 0 ? totalMarket - totalInvested : null
  const gainPct       = gainLoss != null && totalInvested > 0 ? (gainLoss / totalInvested) * 100 : null

  const portfolioValue = totalMarket > 0
    ? formatCurrency(totalMarket)
    : totalInvested > 0 ? 'Refresh prices' : '—'

  const portfolioSub = gainLoss != null
    ? `${gainLoss >= 0 ? '+' : ''}${formatCurrency(gainLoss)}${gainPct != null ? ` (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)` : ''}`
    : totalInvested > 0 ? `${formatCurrency(totalInvested)} invested` : 'Add prices to track'

  const figCount = stats?.minifig_count ?? (ownedFigs as unknown[]).length

  const summaryCards = [
    {
      icon: Package,
      label: 'Sets Owned',
      value: ownedSets.length.toString(),
      sub: `${wantedSets.length} on wishlist`,
      color: 'text-green-400',
      onClick: () => navigate('/collection'),
    },
    {
      icon: Users,
      label: 'Minifigures',
      value: figCount.toString(),
      sub: 'owned across collection',
      color: 'text-amber-400',
      onClick: () => navigate('/collection'),
    },
    {
      icon: gainLoss != null && gainLoss < 0 ? TrendingDown : TrendingUp,
      label: 'Portfolio Value',
      value: portfolioValue,
      sub: portfolioSub,
      color: gainLoss == null ? 'text-blue-400' : gainLoss >= 0 ? 'text-green-400' : 'text-red-400',
      onClick: () => navigate('/collection'),
    },
    {
      icon: Heart,
      label: 'Wishlist',
      value: wantedSets.length.toString(),
      sub: 'sets to acquire',
      color: 'text-red-400',
      onClick: () => navigate('/collection'),
    },
  ]

  const quickLinks = [
    { icon: Package, label: 'Add a Set',         desc: 'Search Rebrickable and add to your collection', path: '/collection' },
    { icon: Search,  label: 'Identify a Photo',  desc: 'Take a photo and AI will identify the set',     path: '/lookup'     },
    { icon: Tag,     label: 'Generate Listing',  desc: 'Create an optimised eBay listing with AI',      path: '/listing'    },
    { icon: Wand2,   label: 'AI Features',       desc: 'Picture lookup, piece identifier, and more',    path: '/lookup'     },
  ]

  return (
    <PageShell
      title={`Welcome back, ${profile?.display_name ?? 'Builder'}!`}
      subtitle="Your LEGO command center"
    >
      <div className="p-6 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summaryCards.map(({ icon: Icon, label, value, sub, color, onClick }) => (
            <Card
              key={label}
              variant="flat"
              className="p-4 cursor-pointer hover:border-[var(--color-accent)]/50 transition-colors"
              onClick={onClick}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[var(--color-surface-overlay)] p-2 shrink-0">
                  <Icon className={cn('h-5 w-5', color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold font-display tabular-nums truncate">{value}</p>
                  <p className="text-xs text-[var(--color-surface-muted)] mt-0.5">{label}</p>
                  {sub && <p className={cn('text-xs mt-0.5 truncate', gainLoss != null && label === 'Portfolio Value' ? (gainLoss >= 0 ? 'text-green-400' : 'text-red-400') : 'text-[var(--color-surface-muted)]')}>{sub}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Quick links */}
        <Card>
          <CardHeader stud>
            <h2 className="text-sm font-bold font-display text-black">Quick Start</h2>
          </CardHeader>
          <CardContent className="py-5">
            <div className="grid md:grid-cols-4 gap-3">
              {quickLinks.map(({ icon: Icon, label, desc, path }) => (
                <button
                  key={label}
                  onClick={() => navigate(path)}
                  className="flex flex-col gap-2 p-4 rounded-xl border border-[var(--color-surface-border)] hover:border-[var(--color-accent)] transition-colors text-left"
                >
                  <div className="rounded-lg bg-[var(--color-surface-overlay)] p-2 w-fit">
                    <Icon className="h-4 w-4 text-[var(--color-accent)]" />
                  </div>
                  <div>
                    <p className="font-semibold font-display text-sm">{label}</p>
                    <p className="text-xs text-[var(--color-surface-muted)] mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </PageShell>
  )
}
