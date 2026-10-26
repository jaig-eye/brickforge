import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'

const control = 'w-full rounded-[11px] border border-line bg-panel-2 text-[13px] text-fg placeholder:text-fg-4 transition-[border,box-shadow,background] duration-150 hover:border-line-strong focus:border-[color-mix(in_srgb,var(--accent)_70%,transparent)] focus:bg-panel focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)] disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest }, ref,
) {
  return <input ref={ref} className={cn(control, 'h-9 px-3', invalid && 'border-down', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-[84px] resize-y px-3 py-2 leading-relaxed', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} className={cn(control, 'h-9 appearance-none pl-3 pr-8')} {...rest}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
    </div>
  )
})

export function SearchInput({ value, onChange, placeholder = 'Search', className, autoFocus, inputRef }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
      <input
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(control, 'h-9 pl-9 pr-8')}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange('') } }}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')}
          className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-fg-4 hover:bg-hover hover:text-fg">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** Label + control + hint/error, wired with ids for accessibility. */
export function Field({ label, hint, error, children, className, aside }: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  aside?: ReactNode
  className?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] font-medium text-fg-2">{label}</label>
        {aside}
      </div>
      {children(id)}
      {error ? <p className="text-[12px] text-down">{error}</p> : hint ? <p className="text-[12px] leading-relaxed text-fg-3">{hint}</p> : null}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[5px] border border-line bg-panel-2 px-1.5 py-px font-mono text-[10.5px] font-medium text-fg-3">{children}</kbd>
}
