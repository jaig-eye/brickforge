import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold font-display transition-colors',
  {
    variants: {
      variant: {
        default:  'bg-[var(--color-accent)] text-[var(--color-accent-text)]',
        outline:  'border border-[var(--color-surface-border)] text-current',
        success:  'bg-green-500/20 text-green-400 border border-green-500/30',
        warning:  'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
        danger:   'bg-red-500/20 text-red-400 border border-red-500/30',
        info:     'bg-blue-500/20 text-blue-400 border border-blue-500/30',
        premium:  'bg-purple-500/20 text-purple-400 border border-purple-500/30',
        alpha:    'bg-orange-500/20 text-orange-400 border border-orange-500/30',
        muted:    'bg-[var(--color-surface-overlay)] text-[var(--color-surface-muted)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
