import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold font-display transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2',
  {
    variants: {
      variant: {
        primary:   'bg-[var(--color-accent)] text-[var(--color-accent-text)] hover:brightness-110 focus-visible:outline-[var(--color-accent)]',
        secondary: 'bg-[var(--color-surface-overlay)] border border-[var(--color-surface-border)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-[var(--color-accent)]',
        ghost:     'hover:bg-[var(--color-surface-overlay)] focus-visible:outline-[var(--color-accent)]',
        danger:    'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-500',
        outline:   'border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-text)]',
      },
      size: {
        sm:   'h-8 px-3 text-xs',
        md:   'h-9 px-4 text-sm',
        lg:   'h-11 px-6 text-base',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = 'Button'

export { Button, buttonVariants }
