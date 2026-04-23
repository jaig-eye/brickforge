import { Package, CheckCircle2, Heart } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatPieceCount, formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/cn'

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
    retail_price_usd: number | null
  }
  onClick?: () => void
  className?: string
}

export function SetCard({ set, onClick, className }: SetCardProps) {
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
      </div>
      <CardContent className="pt-3 pb-3">
        <p className="text-xs font-mono text-[var(--color-accent)] mb-0.5">{set.set_number}</p>
        <p className="text-sm font-semibold font-display leading-tight line-clamp-2">{set.name}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1 flex-wrap">
            {set.year && <Badge variant="outline" className="text-xs">{set.year}</Badge>}
            {set.theme && <Badge variant="muted" className="text-xs">{set.theme}</Badge>}
          </div>
          <div className="text-xs text-[var(--color-surface-muted)]">
            {set.piece_count ? formatPieceCount(set.piece_count) : ''}
          </div>
        </div>
        {set.retail_price_usd && (
          <p className="text-xs text-[var(--color-surface-muted)] mt-1">{formatCurrency(set.retail_price_usd)}</p>
        )}
      </CardContent>
    </Card>
  )
}
