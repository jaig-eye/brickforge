import { useState } from 'react'
import { User, CheckCircle2, Heart, Copy, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/cn'

const CONDITION_BADGE: Record<string, { label: string; variant: 'info' | 'warning' | 'success' }> = {
  new:     { label: 'New',     variant: 'success' },
  used:    { label: 'Used',    variant: 'info'    },
  cracked: { label: 'Cracked', variant: 'warning' },
}

interface MinifigCardProps {
  fig: {
    id?: number
    fig_number: string
    name: string
    character?: string | null
    theme?: string | null
    image_url?: string | null
    is_owned: 0 | 1
    is_wanted: 0 | 1
    quantity?: number
    condition?: 'new' | 'used' | 'cracked'
    acquired_price?: number | null
  }
  marketPrice?: number | null
  onClick?: () => void
  className?: string
}

export function MinifigCard({ fig, marketPrice, onClick, className }: MinifigCardProps) {
  const condInfo = fig.condition ? CONDITION_BADGE[fig.condition] : null
  const paid     = fig.acquired_price ?? null
  const [copied, setCopied] = useState(false)

  const copyName = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = fig.character || fig.name
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card
      className={cn('cursor-pointer hover:border-[var(--color-accent)] transition-colors duration-150 group', className)}
      onClick={onClick}
    >
      <div className="relative aspect-square bg-[var(--color-surface-overlay)] overflow-hidden">
        {fig.image_url
          ? <img src={fig.image_url} alt={fig.name} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-200" />
          : <div className="w-full h-full flex items-center justify-center"><User className="h-10 w-10 text-[var(--color-surface-muted)]" /></div>
        }
        <div className="absolute top-2 right-2 flex gap-1">
          {fig.is_owned === 1 && <CheckCircle2 className="h-4 w-4 text-green-400 drop-shadow" />}
          {fig.is_wanted === 1 && <Heart className="h-4 w-4 text-red-400 drop-shadow" />}
        </div>
        {/* Copy button — visible on hover */}
        <button
          onClick={copyName}
          title="Copy name"
          className={cn(
            'absolute bottom-2 left-2 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono transition-all',
            'bg-black/70 text-white opacity-0 group-hover:opacity-100',
            copied && 'opacity-100 text-green-400',
          )}
        >
          {copied
            ? <><Check className="h-3 w-3" />Copied</>
            : <><Copy className="h-3 w-3" />{fig.fig_number}</>
          }
        </button>
        {(fig.quantity ?? 0) > 1 && (
          <div className="absolute bottom-2 right-2 bg-black/60 rounded px-1.5 py-0.5 text-xs font-mono text-white">
            ×{fig.quantity}
          </div>
        )}
      </div>
      <CardContent className="pt-3 pb-3">
        <p className="text-xs font-mono text-[var(--color-accent)] mb-0.5">{fig.fig_number}</p>
        <p className="text-sm font-semibold font-display leading-tight line-clamp-2 select-text">{fig.name}</p>
        <div className="flex gap-1 flex-wrap mt-2">
          {fig.character && (
            <Badge
              variant="outline"
              className="text-xs cursor-copy select-text"
              title="Click to copy"
              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(fig.character!) }}
            >
              {fig.character}
            </Badge>
          )}
          {fig.theme && <Badge variant="muted" className="text-xs">{fig.theme}</Badge>}
          {condInfo && <Badge variant={condInfo.variant} className="text-xs">{condInfo.label}</Badge>}
        </div>
        {(paid != null || marketPrice != null) && (
          <div className="mt-2 pt-2 border-t border-[var(--color-surface-border)] flex items-center gap-2 text-xs text-[var(--color-surface-muted)]">
            {paid != null && <span>Paid {formatCurrency(paid)}</span>}
            {paid != null && marketPrice != null && <span>·</span>}
            {marketPrice != null && <span className="font-semibold text-current">Mkt {formatCurrency(marketPrice)}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
