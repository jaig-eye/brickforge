import { useState } from 'react'
import { Package, CheckCircle2, Heart, TrendingUp, TrendingDown, Copy, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatPieceCount, formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/cn'

const CONDITION_BADGE: Record<string, { label: string; variant: 'info' | 'warning' | 'success' }> = {
  sealed:           { label: 'Sealed',           variant: 'success' },
  open_complete:    { label: 'Open · Complete',   variant: 'info'    },
  open_incomplete:  { label: 'Open · Incomplete', variant: 'warning' },
  // legacy fallbacks
  new:              { label: 'New/Sealed',        variant: 'success' },
  used:             { label: 'Open/Used',         variant: 'warning' },
}

interface SetCardProps {
  set: {
    id: number
    set_number: string
    name: string
    year: number | null
    theme: string | null
    piece_count: number | null
    image_url: string | null
    is_owned: 0 | 1
    is_wanted: 0 | 1
    condition?: 'sealed' | 'open_complete' | 'open_incomplete' | 'new' | 'used'
    acquired_price?: number | null
    retail_price_usd?: number | null
  }
  /** Latest BrickLink market price relevant to the set's condition (new or used). */
  marketPrice?: number | null
  onClick?: () => void
  className?: string
}

export function SetCard({ set, marketPrice, onClick, className }: SetCardProps) {
  const condInfo = set.condition ? CONDITION_BADGE[set.condition] : null
  const paid     = set.acquired_price ?? null
  const gain     = (paid != null && marketPrice != null) ? marketPrice - paid : null
  const [copied, setCopied] = useState(false)

  const copySetNum = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(set.set_number)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card
      className={cn('cursor-pointer hover:border-[var(--color-accent)] transition-colors duration-150 group', className)}
      onClick={onClick}
    >
      <div className="relative aspect-video bg-[var(--color-surface-overlay)] overflow-hidden">
        {set.image_url
          ? <img src={set.image_url} alt={set.name} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-200" />
          : <div className="w-full h-full flex items-center justify-center"><Package className="h-10 w-10 text-[var(--color-surface-muted)]" /></div>
        }
        <div className="absolute top-2 right-2 flex gap-1">
          {set.is_owned === 1 && <CheckCircle2 className="h-4 w-4 text-green-400 drop-shadow" />}
          {set.is_wanted === 1 && <Heart className="h-4 w-4 text-red-400 drop-shadow" />}
        </div>
        {/* Copy button — visible on hover */}
        <button
          onClick={copySetNum}
          title="Copy set number"
          className={cn(
            'absolute bottom-2 left-2 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono transition-all',
            'bg-black/70 text-white opacity-0 group-hover:opacity-100',
            copied && 'opacity-100 text-green-400',
          )}
        >
          {copied
            ? <><Check className="h-3 w-3" />Copied</>
            : <><Copy className="h-3 w-3" />{set.set_number}</>
          }
        </button>
      </div>

      <CardContent className="pt-3 pb-3">
        <p className="text-xs font-mono text-[var(--color-accent)] mb-0.5">{set.set_number}</p>
        <p className="text-sm font-semibold font-display leading-tight line-clamp-2 select-text">{set.name}</p>

        {/* Year / condition / pieces row */}
        <div className="flex items-center justify-between mt-2 gap-1 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {set.year && <Badge variant="outline" className="text-xs">{set.year}</Badge>}
            {condInfo && <Badge variant={condInfo.variant} className="text-xs">{condInfo.label}</Badge>}
          </div>
          <span className="text-xs text-[var(--color-surface-muted)] shrink-0">
            {set.piece_count ? formatPieceCount(set.piece_count) : ''}
          </span>
        </div>

        {/* Pricing row — only when there's something to show */}
        {(paid != null || marketPrice != null) && (
          <div className="mt-2 pt-2 border-t border-[var(--color-surface-border)] flex items-center justify-between gap-2 text-xs">
            <div className="flex flex-col gap-0.5">
              {paid != null && (
                <span className="text-[var(--color-surface-muted)]">Paid {formatCurrency(paid)}</span>
              )}
              {marketPrice != null && (
                <span className="font-semibold">Mkt {formatCurrency(marketPrice)}</span>
              )}
            </div>
            {gain != null && (
              <div className={cn(
                'flex items-center gap-0.5 font-bold text-xs shrink-0',
                gain >= 0 ? 'text-green-400' : 'text-red-400',
              )}>
                {gain >= 0
                  ? <TrendingUp className="h-3 w-3" />
                  : <TrendingDown className="h-3 w-3" />
                }
                {gain >= 0 ? '+' : ''}{formatCurrency(gain)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
