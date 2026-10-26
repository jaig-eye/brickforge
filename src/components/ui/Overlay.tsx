/**
 * Dialogs and side sheets (Radix for focus trapping, Escape, and screen
 * reader semantics; framer-motion for the movement). A sheet keeps your place
 * on the page behind it — details open beside the grid, not instead of it.
 */
import * as RD from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SOFT, SNAP } from '@/lib/motion'
import { IconButton } from './Button'

export function Dialog({ open, onOpenChange, title, description, children, footer, width = 520, className }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number
  className?: string
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            <RD.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[3px]"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} />
            </RD.Overlay>
            <RD.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className={cn('panel fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[calc(100vw-48px)] flex-col overflow-hidden !rounded-[20px] shadow-[var(--shadow-3)]', className)}
                style={{ maxWidth: width, x: '-50%' }}
                initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={SNAP}
              >
                <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
                  <div className="min-w-0">
                    <RD.Title className="font-display text-[19px] font-bold">{title}</RD.Title>
                    {description
                      ? <RD.Description className="mt-1 text-[13px] leading-relaxed text-fg-3">{description}</RD.Description>
                      : <RD.Description className="sr-only">{title}</RD.Description>}
                  </div>
                  <RD.Close asChild><IconButton label="Close" size="sm"><X className="size-4" /></IconButton></RD.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-2">{children}</div>
                {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-panel-2/60 px-6 py-3.5">{footer}</div>}
              </motion.div>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  )
}

export function Sheet({ open, onOpenChange, title, children, width = 500, header }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  width?: number
  header?: ReactNode
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RD.Portal forceMount>
            <RD.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-40 bg-[var(--scrim)]"
                initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
            </RD.Overlay>
            <RD.Content asChild forceMount tabIndex={-1}
              onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true }) }}>
              <motion.aside
                className="fixed bottom-2 right-2 top-[52px] z-40 flex flex-col overflow-hidden rounded-[22px] border border-line bg-panel shadow-[var(--shadow-3)] focus:outline-none"
                style={{ width: `min(${width}px, calc(100vw - 120px))` }}
                initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 30, opacity: 0 }}
                transition={SOFT}
              >
                <RD.Title className="sr-only">{title}</RD.Title>
                <RD.Description className="sr-only">Details for {title}</RD.Description>
                <div className="absolute right-3 top-3 z-10">
                  <RD.Close asChild>
                    <IconButton label="Close" size="sm" className="bg-panel/80 backdrop-blur"><X className="size-4" /></IconButton>
                  </RD.Close>
                </div>
                {header}
                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
              </motion.aside>
            </RD.Content>
          </RD.Portal>
        )}
      </AnimatePresence>
    </RD.Root>
  )
}

/** A yes/no question built into the app (window.confirm can't be styled). */
export function Confirm({ open, onOpenChange, title, body, confirmLabel, danger, onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} width={440}
      footer={
        <>
          <RD.Close asChild><button className="h-9 rounded-[11px] px-3.5 text-[13px] text-fg-2 hover:bg-hover">Cancel</button></RD.Close>
          <button
            autoFocus
            onClick={() => { onConfirm(); onOpenChange(false) }}
            className={cn('h-9 rounded-[11px] px-3.5 text-[13px] font-semibold', danger ? 'bg-down text-white hover:brightness-110' : 'bg-accent text-accent-ink hover:brightness-105')}
          >
            {confirmLabel}
          </button>
        </>
      }>
      <div className="text-[13.5px] leading-relaxed text-fg-2">{body}</div>
    </Dialog>
  )
}
