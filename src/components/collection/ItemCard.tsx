import { memo } from 'react'
import { motion } from 'framer-motion'
import { Check, Heart } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/formatters'
import { SET_CONDITION_LABEL, FIG_CONDITION_LABEL } from '@/lib/conditions'
import type { CollectionSet, CollectionFig } from '@/lib/types'
import { Delta, ItemImage } from '../ui/Bits'

export type CollectionItem = CollectionSet | CollectionFig
export const itemNumber = (i: CollectionItem) => ('set_number' in i ? i.set_number : i.fig_number)
export const itemLabelNumber = (i: CollectionItem) => ('set_number' in i ? i.set_number : i.bricklink_id ?? i.fig_number)

function gainOf(i: CollectionItem): { value: number | null; pct: number | null } {
  if (i.market_price == null || i.acquired_price == null) return { value: null, pct: null }
  const value = (i.market_price - i.acquired_price) * i.quantity
  return { value, pct: i.acquired_price ? ((i.market_price - i.acquired_price) / i.acquired_price) * 100 : null }
}

export const ItemCard = memo(function ItemCard({ item, selected, selecting, onOpen, onToggle, index }: {
  item: CollectionItem
  selected: boolean
  selecting: boolean
  onOpen: () => void
  onToggle: (shift: boolean) => void
  index: number
}) {
  const isSet = 'set_number' in item
  const gain = gainOf(item)
  const value = item.market_price != null ? item.market_price * item.quantity : null
  const condition = isSet ? SET_CONDITION_LABEL[item.condition] : FIG_CONDITION_LABEL[item.condition]

  return (
    <motion.article
      initial={index < 24 ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 24) * 0.025 }}
      className={cn('cv-auto group relative flex cursor-pointer flex-col rounded-[18px] border bg-panel p-2.5 transition-[border,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]',
        selected ? 'border-accent ring-4 ring-[var(--accent-soft)]' : 'border-line hover:border-line-strong')}
      onClick={(e) => { if (selecting || e.ctrlKey || e.metaKey || e.shiftKey) onToggle(e.shiftKey); else onOpen() }}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); if (e.key === ' ') { e.preventDefault(); onToggle(false) } }}
      tabIndex={0}
      aria-label={`${item.name}, ${itemLabelNumber(item)}`}
    >
      <div className="relative">
        <ItemImage src={item.image_url} alt="" className="aspect-[4/3] w-full rounded-[12px] transition-transform duration-300 group-hover:scale-[1.015]" />
        <button type="button" aria-label={selected ? 'Deselect' : 'Select'} aria-pressed={selected}
          onClick={(e) => { e.stopPropagation(); onToggle(e.shiftKey) }}
          className={cn('absolute left-2 top-2 grid size-6 place-items-center rounded-[8px] border-2 transition-all duration-150',
            selected ? 'border-accent bg-accent text-accent-ink' : 'border-[rgb(20_24_36/0.25)] bg-white/80 text-transparent opacity-0 group-hover:opacity-100',
            selecting && !selected && 'opacity-100')}>
          <Check className="size-3.5" strokeWidth={3} />
        </button>
        <div className="absolute right-2 top-2 flex gap-1">
          {item.quantity > 1 && <span className="tnum rounded-full bg-[rgb(12_14_22/0.78)] px-2 py-0.5 font-mono text-[11px] font-semibold text-white">×{item.quantity}</span>}
          {!item.is_owned && item.is_wanted ? <span className="grid size-6 place-items-center rounded-full bg-[rgb(12_14_22/0.78)] text-[#ffc929]"><Heart className="size-3.5" fill="currentColor" /></span> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[11.5px] font-medium text-accent-text">{itemLabelNumber(item)}</span>
          {gain.value != null && <Delta value={gain.value} pct={gain.pct} showPct={false} />}
        </div>
        <h3 className="mt-1 line-clamp-2 font-sans text-[13.5px] font-semibold leading-snug tracking-normal text-fg">{item.name}</h3>
        <p className="mt-0.5 truncate text-[12px] text-fg-3">{[item.theme, item.year].filter(Boolean).join(' · ') || ' '}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <span className={cn('tnum font-mono text-[14px] font-semibold', value == null && 'text-fg-4')}>{value == null ? 'No price' : formatMoney(value)}</span>
          <span className="truncate text-[11.5px] text-fg-3">{condition}</span>
        </div>
      </div>
    </motion.article>
  )
})
