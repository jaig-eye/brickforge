import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

const button = cva(
  'no-drag relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,color,box-shadow,transform,opacity] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink font-semibold shadow-[0_10px_24px_-14px_var(--accent-glow)] hover:brightness-[1.06]',
        secondary: 'bg-panel-2 text-fg border border-line hover:bg-panel-3 hover:border-line-strong',
        ghost: 'text-fg-2 hover:text-fg hover:bg-hover',
        danger: 'bg-down-soft text-down border border-transparent hover:border-down/40',
        link: 'text-accent-text hover:underline underline-offset-4 px-0 h-auto',
      },
      size: {
        sm: 'h-8 rounded-[9px] px-3 text-[12.5px]',
        md: 'h-9 rounded-[11px] px-3.5 text-[13px]',
        lg: 'h-11 rounded-[13px] px-5 text-[14px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  icon?: ReactNode
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, icon, loading, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
})

const iconButton = cva(
  'no-drag inline-flex shrink-0 items-center justify-center text-fg-3 transition-colors duration-150 hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      size: { sm: 'size-7 rounded-[8px]', md: 'size-9 rounded-[10px]', lg: 'size-10 rounded-[12px]' },
      tone: { default: '', danger: 'hover:bg-down-soft hover:text-down', active: 'bg-accent-soft text-accent-text hover:text-accent-text' },
    },
    defaultVariants: { size: 'md', tone: 'default' },
  },
)

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButton> {
  label: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, size, tone, label, type = 'button', ...rest }, ref,
) {
  return <button ref={ref} type={type} aria-label={label} title={label} className={cn(iconButton({ size, tone }), className)} {...rest} />
})
